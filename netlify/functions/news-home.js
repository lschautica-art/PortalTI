const { fetchNews } = require("./news-utils");

exports.handler = async function handler() {
  return fetchNews({
    endpoint: "/search",
    params: {
      q: 'varejo OR supermercados OR mercado OR "mercado financeiro" OR dolar OR cambio OR inflacao',
      lang: "pt",
      country: "br",
      max: "6",
      sortby: "publishedAt",
    },
  });
};
