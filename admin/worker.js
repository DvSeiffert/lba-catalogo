/**
 * API do painel administrativo do catálogo LBA.
 * Roda como Cloudflare Worker. Ver admin/LEIA-ME-WORKER.md para instalar.
 *
 * Por que existe: o site é estático (GitHub Pages) e não tem onde validar
 * senha nem onde gravar. Este Worker faz as duas coisas e guarda o token do
 * GitHub do lado do servidor, para ele nunca chegar ao navegador.
 *
 * Variáveis que precisam estar configuradas no painel da Cloudflare:
 *   SENHA         (secret) senha única do painel
 *   GITHUB_TOKEN  (secret) PAT fine-grained, só este repositório, Contents RW
 *   SEGREDO       (secret) texto aleatório, assina a sessão
 *   REPO          (texto)  DvSeiffert/lba-catalogo
 *   BRANCH        (texto)  main
 *   ORIGEM        (texto)  https://lbafitwear.com.br
 */

const HORAS_SESSAO = 8;

export default {
  async fetch(req, env) {
    const origem = env.ORIGEM || "*";
    if (req.method === "OPTIONS") return corsOk(origem);

    const url = new URL(req.url);
    const rota = url.pathname.replace(/\/+$/, "");

    try {
      if (rota === "/api/login" && req.method === "POST") return await login(req, env, origem);
      if (rota === "/api/catalogo" && req.method === "GET") return await lerCatalogo(req, env, origem);
      if (rota === "/api/catalogo" && req.method === "PUT") return await gravarCatalogo(req, env, origem);
      if (rota === "/api/foto" && req.method === "POST") return await gravarFoto(req, env, origem);
      return json({ erro: "rota desconhecida" }, 404, origem);
    } catch (e) {
      return json({ erro: String(e && e.message || e) }, 500, origem);
    }
  }
};

/* ---------------- sessão ---------------- */

const enc = new TextEncoder();
const b64url = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(segredo, texto) {
  const k = await crypto.subtle.importKey("raw", enc.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", k, enc.encode(texto)));
}

async function iguais(a, b) {
  // comparação por digest, para não vazar o tamanho nem parar no primeiro byte
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(String(a))),
    crypto.subtle.digest("SHA-256", enc.encode(String(b)))
  ]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0;
}

async function login(req, env, origem) {
  if (!env.SENHA || !env.SEGREDO) return json({ erro: "painel sem SENHA ou SEGREDO configurados" }, 500, origem);
  const { senha } = await req.json().catch(() => ({}));
  if (!senha || !(await iguais(senha, env.SENHA))) {
    await new Promise(r => setTimeout(r, 600)); // atrasa tentativa em sequência
    return json({ erro: "senha incorreta" }, 401, origem);
  }
  const exp = Date.now() + HORAS_SESSAO * 3600e3;
  const corpo = b64url(enc.encode(JSON.stringify({ exp })));
  return json({ token: corpo + "." + (await hmac(env.SEGREDO, corpo)), expira: exp }, 200, origem);
}

async function exigeSessao(req, env) {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const [corpo, assinatura] = token.split(".");
  if (!corpo || !assinatura) throw new Error("sessão ausente");
  if (!(await iguais(assinatura, await hmac(env.SEGREDO, corpo)))) throw new Error("sessão inválida");
  const { exp } = JSON.parse(atob(corpo.replace(/-/g, "+").replace(/_/g, "/")));
  if (!exp || Date.now() > exp) throw new Error("sessão expirada");
}

/* ---------------- GitHub ---------------- */

function gh(env, caminho) {
  return `https://api.github.com/repos/${env.REPO}/contents/${caminho}`;
}
function cabecalhos(env) {
  return {
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    accept: "application/vnd.github+json",
    "user-agent": "lba-catalogo-admin",
    "content-type": "application/json"
  };
}

async function lerArquivo(env, caminho) {
  const r = await fetch(`${gh(env, caminho)}?ref=${env.BRANCH}`, { headers: cabecalhos(env) });
  if (r.status === 404) return { conteudo: null, sha: null };
  if (!r.ok) throw new Error(`GitHub ${r.status} ao ler ${caminho}`);
  const d = await r.json();
  return { conteudo: decodeURIComponent(escape(atob(d.content.replace(/\n/g, "")))), sha: d.sha };
}

async function gravarArquivo(env, caminho, base64, mensagem, sha) {
  const corpo = { message: mensagem, content: base64, branch: env.BRANCH };
  if (sha) corpo.sha = sha;
  const r = await fetch(gh(env, caminho), { method: "PUT", headers: cabecalhos(env), body: JSON.stringify(corpo) });
  if (!r.ok) throw new Error(`GitHub ${r.status} ao gravar ${caminho}: ${(await r.text()).slice(0, 300)}`);
  return await r.json();
}

/* ---------------- rotas ---------------- */

async function lerCatalogo(req, env, origem) {
  await exigeSessao(req, env);
  const { conteudo, sha } = await lerArquivo(env, "dados/catalogo.json");
  if (!conteudo) return json({ erro: "dados/catalogo.json não encontrado" }, 404, origem);
  return json({ catalogo: JSON.parse(conteudo), sha }, 200, origem);
}

async function gravarCatalogo(req, env, origem) {
  await exigeSessao(req, env);
  const { catalogo, sha } = await req.json();
  if (!catalogo || !Array.isArray(catalogo.itens) || !catalogo.itens.length) {
    return json({ erro: "catálogo vazio — gravação recusada" }, 400, origem);
  }
  // confere se alguém gravou por cima enquanto o painel estava aberto
  const atual = await lerArquivo(env, "dados/catalogo.json");
  if (sha && atual.sha && sha !== atual.sha) {
    return json({ erro: "o catálogo mudou em outra aba ou por outra pessoa. Recarregue o painel." }, 409, origem);
  }
  catalogo.atualizado = new Date().toISOString().slice(0, 10);
  const texto = JSON.stringify(catalogo, null, 1);
  const base64 = btoa(unescape(encodeURIComponent(texto)));
  const r = await gravarArquivo(env, "dados/catalogo.json", base64,
    `Painel: atualiza o catálogo (${catalogo.itens.length} itens)`, atual.sha);
  return json({ ok: true, sha: r.content.sha, commit: r.commit.sha.slice(0, 7) }, 200, origem);
}

async function gravarFoto(req, env, origem) {
  await exigeSessao(req, env);
  const { nome, base64 } = await req.json();
  if (!/^[a-z0-9-]{2,60}\.jpg$/.test(nome || "")) {
    return json({ erro: "nome de arquivo inválido (use letras minúsculas, números e hífen, terminando em .jpg)" }, 400, origem);
  }
  if (!base64 || base64.length > 4_000_000) {
    return json({ erro: "imagem ausente ou grande demais" }, 400, origem);
  }
  const caminho = `p/${nome}`;
  const atual = await lerArquivo(env, caminho).catch(() => ({ sha: null }));
  const r = await gravarArquivo(env, caminho, base64, `Painel: foto ${nome}`, atual.sha);
  return json({ ok: true, caminho, commit: r.commit.sha.slice(0, 7) }, 200, origem);
}

/* ---------------- util ---------------- */

function cabecalhosCors(origem) {
  return {
    "access-control-allow-origin": origem,
    "access-control-allow-headers": "content-type,authorization",
    "access-control-allow-methods": "GET,PUT,POST,OPTIONS",
    "access-control-max-age": "86400",
    vary: "origin"
  };
}
function corsOk(origem) {
  return new Response(null, { status: 204, headers: cabecalhosCors(origem) });
}
function json(obj, status, origem) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...cabecalhosCors(origem) }
  });
}
