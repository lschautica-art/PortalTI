const { fetchNews } = require("./news-utils");

exports.handler = async function handler() {
  return fetchNews({
    endpoint: "/search",
    params: {
      q: '"tecnologia da informacao" OR ciberseguranca OR cloud OR "inteligencia artificial" OR software OR infraestrutura OR dados OR microsoft OR google OR aws OR oracle OR totvs OR erp',
      lang: "pt",
      country: "br",
      max: "6",
      sortby: "publishedAt",
    },
  });
};
