const GNEWS_BASE_URL = "https://gnews.io/api/v4";

function isoWeekAgo() {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeArticles(payload) {
  return {
    articles: Array.isArray(payload?.articles)
      ? payload.articles.map((item) => ({
          title: item?.title || "",
          description: item?.description || "",
          url: item?.url || "",
          image: item?.image || "",
          publishedAt: item?.publishedAt || "",
          source: { name: item?.source?.name || "" },
        }))
      : [],
  };
}

async function fetchNews(config) {
  const apiKey = process.env.GNEWS_API_KEY || "";

  if (!apiKey) {
    return {
      statusCode: 503,
      body: JSON.stringify({ error: "Defina GNEWS_API_KEY nas variaveis do Netlify." }),
    };
  }

  const params = new URLSearchParams({
    ...config.params,
    from: isoWeekAgo(),
    apikey: apiKey,
  });

  const response = await fetch(`${GNEWS_BASE_URL}${config.endpoint}?${params.toString()}`, {
    headers: {
      "User-Agent": "PortalTI-NetlifyFunction/1.0",
      Accept: "application/json",
    },
  });

  const text = await response.text();
  let payload;

  try {
    payload = JSON.parse(text);
  } catch {
    payload = { error: "Resposta invalida da GNews.", detail: text };
  }

  if (!response.ok) {
    return {
      statusCode: response.status,
      body: JSON.stringify({
        error: "Falha ao consultar a GNews.",
        detail: payload,
      }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify(normalizeArticles(payload)),
  };
}

module.exports = { fetchNews };
