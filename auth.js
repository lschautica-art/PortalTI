const PORTAL_SUPABASE_URL = "https://nfbcjunuanwjsciajifg.supabase.co";
const PORTAL_SUPABASE_ANON_KEY = "sb_publishable_fFiZCvpwkFgcOLob6SVQ7Q_6yJqiDqz";
const PORTAL_LOGIN_EMAIL_DOMAINS = ["distribuidoradc.com.br", "empresa.local"];

const portalSupabase = window.supabase.createClient(
  PORTAL_SUPABASE_URL,
  PORTAL_SUPABASE_ANON_KEY,
);

function normalizarLogin(valor) {
  return String(valor || "").trim().toLowerCase();
}

function obterDominiosLogin() {
  const customDomains = window.PORTAL_AUTH_CONFIG?.loginEmailDomains;
  const domains = Array.isArray(customDomains) && customDomains.length
    ? customDomains
    : PORTAL_LOGIN_EMAIL_DOMAINS;

  return [...new Set(
    domains
      .map((domain) => String(domain || "").trim().toLowerCase())
      .filter(Boolean),
  )];
}

function resolverEmailsLogin(login) {
  const loginNormalizado = normalizarLogin(login);
  if (!loginNormalizado) return [];
  if (loginNormalizado.includes("@")) {
    return [loginNormalizado];
  }

  return obterDominiosLogin().map((domain) => `${loginNormalizado}@${domain}`);
}

function isErroCredenciaisInvalidas(error) {
  const mensagem = String(error?.message || "").toLowerCase();
  const status = Number(error?.status || 0);
  return status === 400 || mensagem.includes("invalid login credentials");
}

function isErroConectividade(error) {
  const mensagem = String(error?.message || "").toLowerCase();
  const nome = String(error?.name || "").toLowerCase();
  return (
    mensagem.includes("failed to fetch")
    || mensagem.includes("network")
    || mensagem.includes("fetch")
    || nome.includes("fetch")
    || nome.includes("network")
  );
}

function resolverEndpointNoticias(secao) {
  const secaoNormalizada = String(secao || "").trim().toLowerCase();
  const sections = new Set(["home", "ti", "rh", "comercial"]);
  if (!sections.has(secaoNormalizada)) {
    throw new Error("Secao de noticias invalida.");
  }

  const sameOriginUrl = `${window.location.origin}/api/news/${secaoNormalizada}`;
  const remoteUrl = `${PORTAL_SUPABASE_URL}/functions/v1/gnews?section=${encodeURIComponent(secaoNormalizada)}&_=${Date.now()}`;
  const localUrl = `http://127.0.0.1:8000/api/news/${secaoNormalizada}`;
  const endpoints = [];

  function adicionarEndpoint(url) {
    if (!url || endpoints.includes(url)) return;
    endpoints.push(url);
  }

  if (window.location.protocol === "file:") {
    adicionarEndpoint(localUrl);
    adicionarEndpoint(remoteUrl);
    return endpoints;
  }

  const host = String(window.location.hostname || "").toLowerCase();
  const isLocalHost = host === "127.0.0.1" || host === "localhost";

  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    adicionarEndpoint(sameOriginUrl);
  }

  if (isLocalHost) {
    adicionarEndpoint(localUrl);
  }

  adicionarEndpoint(remoteUrl);
  return endpoints;
}

async function obterSessaoAtual() {
  const { data, error } = await portalSupabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

async function loginPortal(login, senha) {
  const emails = resolverEmailsLogin(login);
  if (!emails.length) {
    throw new Error("Informe um usuario ou e-mail valido.");
  }

  let ultimoErro = null;

  for (const email of emails) {
    const { data, error } = await portalSupabase.auth.signInWithPassword({
      email,
      password: String(senha || ""),
    });

    if (!error) {
      return { ...data, emailUtilizado: email };
    }

    if (isErroConectividade(error)) {
      throw new Error("Falha ao conectar ao servico de autenticacao. Verifique a URL do Supabase e a ligacao com a internet.");
    }

    ultimoErro = error;
    if (!isErroCredenciaisInvalidas(error)) {
      throw error;
    }
  }

  throw ultimoErro || new Error("Nao foi possivel autenticar o utilizador.");
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
  resolverEmailsLogin,
  resolverEndpointNoticias,
  obterSessaoAtual,
  loginPortal,
  exigirAutenticacao,
  sairPortal,
  ativarLinksLogout,
};
