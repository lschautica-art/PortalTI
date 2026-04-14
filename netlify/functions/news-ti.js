const { fetchNews } = require("./news-utils");

exports.handler = async function handler() {
  return fetchNews({
    endpoint: "/top-headlines",
    params: {
      topic: "technology",
      lang: "pt",
      country: "br",
      max: "6",
    },
  });
};
