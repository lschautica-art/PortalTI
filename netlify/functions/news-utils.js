const GNEWS_BASE_URL = "https://gnews.io/api/v4";
const CACHE_TTL_MS = Number(process.env.PORTAL_NEWS_CACHE_TTL || 15 * 60 * 1000);
const STALE_CACHE_MAX_MS = Number(process.env.PORTAL_NEWS_STALE_TTL || 6 * 60 * 60 * 1000);
const newsCache = new Map();

function isoWeekAgo() {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

function buildHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=300, stale-while-revalidate=900",
  };
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

function getCacheKey(config) {
  return JSON.stringify([config.endpoint, config.params]);
}

function getCachedEntry(config, maxAgeMs = CACHE_TTL_MS) {
  const entry = newsCache.get(getCacheKey(config));

  if (!entry) {
    return null;
  }

  if (Date.now() - entry.fetchedAt > maxAgeMs) {
    return null;
  }

  return structuredClone(entry.data);
}

function saveCachedEntry(config, data) {
  newsCache.set(getCacheKey(config), {
    fetchedAt: Date.now(),
    data: structuredClone(data),
  });
}

function buildSuccessResponse(body) {
  return {
    statusCode: 200,
    headers: buildHeaders(),
    body: JSON.stringify(body),
  };
}

function buildWarningPayload(message, cachedData) {
  return {
    ...(cachedData || { articles: [] }),
    warning: message,
  };
}

async function fetchNews(config) {
  const apiKey = process.env.GNEWS_API_KEY || "";

  if (!apiKey) {
    return {
      statusCode: 503,
      headers: buildHeaders(),
      body: JSON.stringify({ error: "Defina GNEWS_API_KEY nas variaveis do Netlify." }),
    };
  }

  const freshCache = getCachedEntry(config);
  if (freshCache) {
    return buildSuccessResponse(freshCache);
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
    const staleCache = getCachedEntry(config, STALE_CACHE_MAX_MS);

    if (staleCache) {
      return buildSuccessResponse(
        buildWarningPayload(
          "Exibindo noticias em cache por indisponibilidade temporaria da GNews.",
          staleCache,
        ),
      );
    }

    if (response.status === 429) {
      return buildSuccessResponse(
        buildWarningPayload(
          "A GNews limitou temporariamente as consultas. Tente atualizar novamente em alguns minutos.",
        ),
      );
    }

    return {
      statusCode: response.status,
      headers: buildHeaders(),
      body: JSON.stringify({
        error: "Falha ao consultar a GNews.",
        detail: payload,
      }),
    };
  }

  const normalized = normalizeArticles(payload);
  saveCachedEntry(config, normalized);

  return buildSuccessResponse(normalized);
}

module.exports = { fetchNews };
