import json
import os
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen


BASE_DIR = Path(__file__).resolve().parent


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


load_dotenv(BASE_DIR / ".env")

HOST = os.getenv("PORTAL_HOST", "127.0.0.1")
PORT = int(os.getenv("PORTAL_PORT", "8000"))
GNEWS_API_KEY = os.getenv("GNEWS_API_KEY", "").strip()

GNEWS_BASE_URL = "https://gnews.io/api/v4"
NEWS_CONFIG = {
    "ti": {
        "path": "/api/news/ti",
        "endpoint": "/top-headlines",
        "params": {
            "topic": "technology",
            "lang": "pt",
            "country": "br",
            "max": "6",
        },
    },
    "rh": {
        "path": "/api/news/rh",
        "endpoint": "/search",
        "params": {
            "q": '"recursos humanos" OR "gestao de pessoas" OR recrutamento OR beneficios OR lideranca',
            "lang": "pt",
            "country": "br",
            "max": "6",
            "sortby": "publishedAt",
        },
    },
}


def iso_week_ago() -> str:
    return (datetime.now(timezone.utc) - timedelta(days=7)).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def normalize_articles(payload: dict) -> dict:
    articles = []
    for item in payload.get("articles", []):
        articles.append(
            {
                "title": item.get("title"),
                "description": item.get("description"),
                "url": item.get("url"),
                "image": item.get("image"),
                "publishedAt": item.get("publishedAt"),
                "source": {"name": (item.get("source") or {}).get("name")},
            }
        )
    return {"articles": articles}


def fetch_news(section: str) -> tuple[int, dict]:
    if section not in NEWS_CONFIG:
        return 404, {"error": "Secao de noticias nao encontrada."}

    if not GNEWS_API_KEY:
        return 503, {"error": "Defina a variavel de ambiente GNEWS_API_KEY no backend."}

    config = NEWS_CONFIG[section]
    params = dict(config["params"])
    params["from"] = iso_week_ago()
    params["apikey"] = GNEWS_API_KEY
    url = f"{GNEWS_BASE_URL}{config['endpoint']}?{urlencode(params)}"
    request = Request(
        url,
        headers={
            "User-Agent": "PortalTI-NewsProxy/1.0",
            "Accept": "application/json",
        },
    )

    try:
        with urlopen(request, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8"))
            return 200, normalize_articles(data)
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        return exc.code, {"error": "Falha ao consultar a GNews.", "detail": detail or str(exc)}
    except URLError as exc:
        return 502, {"error": "Nao foi possivel conectar ao servico de noticias.", "detail": str(exc.reason)}
    except Exception as exc:
        return 500, {"error": "Erro inesperado no backend de noticias.", "detail": str(exc)}


class PortalHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        route = parsed.path.rstrip("/") or "/"

        if route in (NEWS_CONFIG["ti"]["path"], NEWS_CONFIG["rh"]["path"]):
            section = "ti" if route.endswith("/ti") else "rh"
            status, payload = fetch_news(section)
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return

        if route == "/":
            self.path = "/index.html"

        super().do_GET()


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), PortalHandler)
    print(f"Servidor do portal ativo em http://{HOST}:{PORT}")
    if GNEWS_API_KEY:
        print("GNEWS_API_KEY carregada com sucesso. Noticias habilitadas no backend.")
    else:
        print("Defina GNEWS_API_KEY no ambiente para habilitar as noticias.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
