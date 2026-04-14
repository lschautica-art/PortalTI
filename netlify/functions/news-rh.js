const { fetchNews } = require("./news-utils");

exports.handler = async function handler() {
  return fetchNews({
    endpoint: "/search",
    params: {
      q: '"mercado de trabalho" OR salarios OR salário OR remuneracao OR remuneração OR beneficios OR benefícios OR "politicas trabalhistas" OR "relações trabalhistas" OR "direitos trabalhistas" OR emprego OR empregos OR "jornada de trabalho" OR home office OR "trabalho híbrido"',
      lang: "pt",
      country: "br",
      max: "6",
      sortby: "publishedAt",
    },
  });
};
