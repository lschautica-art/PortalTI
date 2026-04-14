import json
import os
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen


BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / ".cache"
CACHE_TTL_SECONDS = int(os.getenv("PORTAL_NEWS_CACHE_TTL", "900"))


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
        "alt_path": "/.netlify/functions/news-ti",
        "endpoint": "/search",
        "params": {
            "q": '"tecnologia da informacao" OR ciberseguranca OR cloud OR software OR infraestrutura OR dados OR microsoft OR google OR aws OR oracle',
            "lang": "pt",
            "country": "br",
            "max": "6",
            "sortby": "publishedAt",
        },
    },
    "rh": {
        "path": "/api/news/rh",
        "alt_path": "/.netlify/functions/news-rh",
        "endpoint": "/search",
        "params": {
            "q": '"mercado de trabalho" OR salario OR beneficios OR emprego OR "jornada de trabalho" OR "home office" OR "trabalho hibrido" OR "direitos trabalhistas"',
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


def get_cache_path(section: str) -> Path:
    return CACHE_DIR / f"news-{section}.json"


def load_cached_news(section: str, *, allow_stale: bool = True) -> dict | None:
    cache_path = get_cache_path(section)
    if not cache_path.exists():
        return None

    try:
        payload = json.loads(cache_path.read_text(encoding="utf-8"))
        fetched_at = datetime.fromisoformat(payload["fetched_at"])
        age_seconds = (datetime.now(timezone.utc) - fetched_at).total_seconds()
        if allow_stale or age_seconds <= CACHE_TTL_SECONDS:
            return payload["data"]
    except Exception:
        return None

    return None


def save_cached_news(section: str, data: dict) -> None:
    CACHE_DIR.mkdir(exist_ok=True)
    cache_path = get_cache_path(section)
    payload = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }
    cache_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def build_warning_payload(message: str) -> dict:
    return {
        "articles": [],
        "warning": message,
    }


def fetch_news(section: str) -> tuple[int, dict]:
    if section not in NEWS_CONFIG:
        return 404, {"error": "Secao de noticias nao encontrada."}

    if not GNEWS_API_KEY:
        return 503, {"error": "Defina a variavel de ambiente GNEWS_API_KEY no backend."}

    config = NEWS_CONFIG[section]
    cached_data = load_cached_news(section, allow_stale=False)
    if cached_data:
        return 200, cached_data

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
            normalized = normalize_articles(data)
            save_cached_news(section, normalized)
            return 200, normalized
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        stale_cache = load_cached_news(section, allow_stale=True)
        if stale_cache:
            stale_cache["cached"] = True
            stale_cache["warning"] = "Servindo noticias em cache por indisponibilidade temporaria da GNews."
            return 200, stale_cache
        if exc.code == 429 or "too many requests" in detail.lower():
            return 200, build_warning_payload("A GNews limitou temporariamente as consultas desta chave. Tente novamente em alguns minutos.")
        return exc.code, {"error": "Falha ao consultar a GNews.", "detail": detail or str(exc)}
    except URLError as exc:
        stale_cache = load_cached_news(section, allow_stale=True)
        if stale_cache:
            stale_cache["cached"] = True
            stale_cache["warning"] = "Servindo noticias em cache por falha temporaria de conexao."
            return 200, stale_cache
        return 502, {"error": "Nao foi possivel conectar ao servico de noticias.", "detail": str(exc.reason)}
    except Exception as exc:
        stale_cache = load_cached_news(section, allow_stale=True)
        if stale_cache:
            stale_cache["cached"] = True
            stale_cache["warning"] = "Servindo noticias em cache por erro temporario no backend."
            return 200, stale_cache
        return 500, {"error": "Erro inesperado no backend de noticias.", "detail": str(exc)}


class PortalHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def send_api_headers(self, content_length: int) -> None:
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(content_length))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        route = parsed.path.rstrip("/") or "/"

        valid_paths = {
            NEWS_CONFIG["ti"]["path"]: "ti",
            NEWS_CONFIG["ti"]["alt_path"]: "ti",
            NEWS_CONFIG["rh"]["path"]: "rh",
            NEWS_CONFIG["rh"]["alt_path"]: "rh",
        }

        if route in valid_paths:
            section = valid_paths[route]
            status, payload = fetch_news(section)
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_api_headers(len(body))
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
