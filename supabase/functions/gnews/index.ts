const GNEWS_BASE_URL = "https://gnews.io/api/v4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=300, stale-while-revalidate=900",
  "Content-Type": "application/json; charset=utf-8",
};

const newsSections = {
  ti: {
    endpoint: "/search",
    params: {
      q: '"tecnologia da informacao" OR ciberseguranca OR cloud OR "inteligencia artificial" OR software OR infraestrutura OR dados OR microsoft OR google OR aws OR oracle OR totvs OR erp',
      lang: "pt",
      country: "br",
      max: "6",
      sortby: "publishedAt",
    },
  },
  rh: {
    endpoint: "/search",
    params: {
      q: '"mercado de trabalho" OR salario OR beneficios OR emprego OR "jornada de trabalho" OR "home office" OR "trabalho hibrido" OR "direitos trabalhistas"',
      lang: "pt",
      country: "br",
      max: "6",
      sortby: "publishedAt",
    },
  },
  comercial: {
    endpoint: "/search",
    params: {
      q: 'vendas OR comercial OR "forca de vendas" OR clientes OR negociacao OR prospeccao OR "expansao de mercado" OR faturamento OR crm',
      lang: "pt",
      country: "br",
      max: "6",
      sortby: "publishedAt",
    },
  },
  home: {
    endpoint: "/search",
    params: {
      q: 'varejo OR supermercados OR mercado OR "mercado financeiro" OR dolar OR cambio OR inflacao',
      lang: "pt",
      country: "br",
      max: "6",
      sortby: "publishedAt",
    },
  },
} as const;

type SectionName = keyof typeof newsSections;

function isoWeekAgo() {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders,
  });
}

function normalizeArticles(payload: any) {
  return {
    articles: Array.isArray(payload?.articles)
      ? payload.articles.map((item: any) => ({
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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const section = (url.searchParams.get("section") || "").toLowerCase() as SectionName;

  if (!section || !(section in newsSections)) {
    return jsonResponse({ error: "Secao de noticias invalida." }, 400);
  }

  const apiKey = Deno.env.get("GNEWS_API_KEY") || "";
  if (!apiKey) {
    return jsonResponse({ error: "Defina GNEWS_API_KEY nos secrets do Supabase." }, 503);
  }

  const config = newsSections[section];
  const params = new URLSearchParams({
    ...config.params,
    from: isoWeekAgo(),
    apikey: apiKey,
  });

  try {
    const response = await fetch(`${GNEWS_BASE_URL}${config.endpoint}?${params.toString()}`, {
      headers: {
        "User-Agent": "PortalTI-SupabaseEdgeFunction/1.0",
        Accept: "application/json",
      },
    });

    const payload = await response.json().catch(async () => ({
      error: "Resposta invalida da GNews.",
      detail: await response.text().catch(() => ""),
    }));

    if (!response.ok) {
      if (response.status === 429 || response.status === 403) {
        return jsonResponse({
          articles: [],
          warning: "A GNews limitou temporariamente as consultas desta chave. Tente novamente mais tarde.",
        });
      }

      return jsonResponse(
        {
          error: "Falha ao consultar a GNews.",
          detail: payload,
        },
        response.status,
      );
    }

    return jsonResponse(normalizeArticles(payload));
  } catch (error) {
    return jsonResponse(
      {
        error: "Erro inesperado ao consultar a GNews.",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
