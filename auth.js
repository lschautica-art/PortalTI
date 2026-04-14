const PORTAL_SUPABASE_URL = "https://nfbcjunuanwjsciajifg.supabase.co";
const PORTAL_SUPABASE_ANON_KEY = "sb_publishable_fFiZCvpwkFgcOLob6SVQ7Q_6yJqiDqz";
const PORTAL_LOGIN_EMAIL_DOMAIN = "empresa.local";

const portalSupabase = window.supabase.createClient(
  PORTAL_SUPABASE_URL,
  PORTAL_SUPABASE_ANON_KEY,
);

function normalizarLogin(valor) {
  return String(valor || "").trim().toLowerCase();
}

function resolverEmailLogin(login) {
  const loginNormalizado = normalizarLogin(login);
  if (!loginNormalizado) return "";
  return loginNormalizado.includes("@")
    ? loginNormalizado
    : `${loginNormalizado}@${PORTAL_LOGIN_EMAIL_DOMAIN}`;
}

function resolverEndpointNoticias(secao) {
  const secaoNormalizada = String(secao || "").trim().toLowerCase();
  const sections = new Set(["home", "ti", "rh"]);
  if (!sections.has(secaoNormalizada)) {
    throw new Error("Secao de noticias invalida.");
  }

  const remoteUrl = `${PORTAL_SUPABASE_URL}/functions/v1/gnews?section=${encodeURIComponent(secaoNormalizada)}&_=${Date.now()}`;
  const localUrl = `http://127.0.0.1:8000/api/news/${secaoNormalizada}`;

  if (window.location.protocol === "file:") {
    return [remoteUrl, localUrl];
  }

  return [remoteUrl];
}

async function obterSessaoAtual() {
  const { data, error } = await portalSupabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

async function loginPortal(login, senha) {
  const email = resolverEmailLogin(login);

  const { data, error } = await portalSupabase.auth.signInWithPassword({
    email,
    password: String(senha || ""),
  });

  if (error) throw error;
  return data;
}

async function exigirAutenticacao() {
  try {
    const sessao = await obterSessaoAtual();
    if (!sessao) {
      window.location.href = "index.html";
      return null;
    }
    return sessao;
  } catch (error) {
    console.error("Falha ao validar a sessao no Supabase:", error);
    window.location.href = "index.html";
    return null;
  }
}

async function sairPortal() {
  try {
    await portalSupabase.auth.signOut();
  } finally {
    window.location.href = "index.html";
  }
}

function ativarLinksLogout() {
  document.querySelectorAll("[data-logout-link]").forEach((link) => {
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      await sairPortal();
    });
  });
}

window.portalAuth = {
  supabase: portalSupabase,
  normalizarLogin,
  resolverEmailLogin,
  resolverEndpointNoticias,
  obterSessaoAtual,
  loginPortal,
  exigirAutenticacao,
  sairPortal,
  ativarLinksLogout,
};
