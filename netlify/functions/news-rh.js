const { fetchNews } = require("./news-utils");

exports.handler = async function handler() {
  return fetchNews({
    endpoint: "/search",
    params: {
      q: '"recursos humanos" OR "gestao de pessoas" OR recrutamento OR selecao OR beneficios OR "clima organizacional" OR "cultura organizacional" OR "trabalho hibrido" OR lideranca OR onboarding',
      lang: "pt",
      country: "br",
      max: "6",
      sortby: "publishedAt",
    },
  });
};
