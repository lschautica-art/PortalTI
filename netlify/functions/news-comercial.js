const { fetchNews } = require("./news-utils");

exports.handler = async function handler() {
  return fetchNews({
    endpoint: "/search",
    params: {
      q: 'vendas OR comercial OR "forca de vendas" OR clientes OR negociacao OR prospeccao OR "expansao de mercado" OR faturamento OR crm',
      lang: "pt",
      country: "br",
      max: "6",
      sortby: "publishedAt",
    },
  });
};
