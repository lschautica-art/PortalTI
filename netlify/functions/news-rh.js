const { fetchNews } = require("./news-utils");

exports.handler = async function handler() {
  return fetchNews({
    endpoint: "/search",
    params: {
      q: '"mercado de trabalho" OR salario OR beneficios OR emprego OR "jornada de trabalho" OR "home office" OR "trabalho hibrido" OR "direitos trabalhistas"',
      lang: "pt",
      country: "br",
      max: "6",
      sortby: "publishedAt",
    },
  });
};
