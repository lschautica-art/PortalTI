const { fetchNews } = require("./news-utils");

exports.handler = async function handler() {
  return fetchNews({
    endpoint: "/search",
    params: {
      q: '"mercado de trabalho" OR salarios OR salario OR remuneracao OR remuneracao OR beneficios OR beneficios OR "politicas trabalhistas" OR "relacoes trabalhistas" OR "direitos trabalhistas" OR emprego OR empregos OR "jornada de trabalho" OR home office OR "trabalho hibrido"',
      lang: "pt",
      country: "br",
      max: "6",
      sortby: "publishedAt",
    },
  });
};
