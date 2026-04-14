const { fetchNews } = require("./news-utils");

exports.handler = async function handler() {
  return fetchNews({
    endpoint: "/search",
    params: {
      q: '"gestao comercial" OR "equipe comercial" OR vendedores OR "funil de vendas" OR "metas de vendas" OR prospeccao OR "geracao de leads" OR crm OR "relacionamento com clientes" OR "resultado comercial" OR faturamento',
      lang: "pt",
      country: "br",
      max: "6",
      sortby: "publishedAt",
    },
  });
};
