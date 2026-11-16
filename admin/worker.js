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
 *
 * Provador virtual:
 *   GEMINI_KEY      (secret) chave da API do Gemini
 *   PROVADOR_TESTE  (secret) senha da via de teste, opcional
 *   PROVADOR_LIGADO (texto)  1 liga, 0 desliga e some o botão do site
 *   PROVADOR_DIA    (texto)  teto de gerações por dia, hoje 40
 *   PROVADOR_IP_DIA (texto)  teto por IP por dia, hoje 20
 *   PROVADOR        (KV)     espaço lba-provador, onde ficam os contadores
 */

const HORAS_SESSAO = 8;

export default {
  async fetch(req, env, ctx) {
    const origem = env.ORIGEM || "*";
    const url = new URL(req.url);
    const rota = url.pathname.replace(/\/+$/, "");
    // CORS não protege nada — quem chama fora do navegador o ignora. Ele só
    // decide quem consegue chamar de dentro de uma página. As rotas públicas
    // abrem para qualquer origem; as do painel seguem presas à ORIGEM.
    const PUBLICAS = ["/catalogo.json", "/api/provador", "/api/provar"];
    if (req.method === "OPTIONS") return corsOk(PUBLICAS.includes(rota) ? "*" : origem);

    try {
      // Rota pública: é o que o site lê. Serve para o catálogo mudar na hora,
      // sem esperar o GitHub Pages reconstruir. Não exige sessão — devolve
      // exatamente o que já é público no repositório.
      if (rota === "/catalogo.json" && req.method === "GET") return await catalogoPublico(req, env, ctx);
      if (rota === "/api/provador" && req.method === "GET") return json(await estadoProvador(env), 200, "*");
      if (rota === "/api/provar" && req.method === "POST") return await provar(req, env, ctx);
      if (rota === "/api/login" && req.method === "POST") return await login(req, env, origem);
      if (rota === "/api/contagem" && req.method === "GET") return await contagemProvador(req, env, origem);
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

/* ---------------- provador: travas e estado ---------------- */

/* Os contadores vivem em KV, não no limitador nativo dos Workers: aquele se
   configura por Wrangler, e este Worker é mantido colando código no painel.
   KV é eventualmente consistente, então a contagem pode escorregar um pouco
   para cima — é uma proteção de gasto, não contabilidade. */

const DIAS_CONTADOR = 48 * 3600;        // chaves de trava: dois dias bastam
const DIAS_REGISTRO = 9 * 24 * 3600;    // contagem que o painel mostra: nove

const hojeSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const numero = (v, padrao) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : padrao; };

function provadorLigado(env) {
  return String(env.PROVADOR_LIGADO || "0") === "1" && !!env.PROVADOR && !!env.GEMINI_KEY;
}

async function somar(env, chave, limite, validade) {
  const atual = numero(await env.PROVADOR.get(chave), 0);
  if (atual >= limite) return false;
  await env.PROVADOR.put(chave, String(atual + 1), { expirationTtl: validade });
  return true;
}

async function estadoProvador(env) {
  if (!provadorLigado(env)) return { ligado: false, restante: 0 };
  try {
    const teto = numero(env.PROVADOR_DIA, 0);
    const usado = numero(await env.PROVADOR.get("dia:" + hojeSP()), 0);
    return { ligado: true, restante: Math.max(0, teto - usado) };
  } catch (_) {
    // KV fora do ar: recusa em vez de liberar. Provador parado é melhor que
    // conta em aberto.
    return { ligado: false, restante: 0 };
  }
}

/* Reserva antes de a chamada sair, porque chamada que sai pode custar. */
async function reservarVaga(env, ip) {
  if (!provadorLigado(env)) return { ok: false, motivo: "desligado" };
  const d = hojeSP();
  try {
    if (!(await somar(env, `ip:${d}:${ip}`, numero(env.PROVADOR_IP_DIA, 0), DIAS_CONTADOR)))
      return { ok: false, motivo: "ip" };
    if (!(await somar(env, `dia:${d}`, numero(env.PROVADOR_DIA, 0), DIAS_CONTADOR)))
      return { ok: false, motivo: "teto" };
    return { ok: true };
  } catch (_) {
    return { ok: false, motivo: "kv" };
  }
}

/* Só contagem, nada pessoal: nem foto, nem IP, nem nada que identifique. */
async function registrar(env, campo) {
  try {
    const k = `conta:${hojeSP()}:${campo}`;
    const n = numero(await env.PROVADOR.get(k), 0);
    await env.PROVADOR.put(k, String(n + 1), { expirationTtl: DIAS_REGISTRO });
  } catch (_) { /* contagem não vale derrubar a resposta */ }
}

/* Sete dias de contagem, para o painel. Exige sessão: não é segredo, mas
   também não é assunto de visitante. */
async function contagemProvador(req, env, origem) {
  await exigeSessao(req, env);
  const estado = await estadoProvador(env);
  const teto = numero(env.PROVADOR_DIA, 0);
  const dias = [];
  try {
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() - i * 86400e3)
        .toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      const [provas, recusas, falhas] = await Promise.all([
        env.PROVADOR.get(`conta:${d}:provas`),
        env.PROVADOR.get(`conta:${d}:recusas`),
        env.PROVADOR.get(`conta:${d}:falhas`)
      ]);
      dias.push({ dia: d, provas: numero(provas, 0), recusas: numero(recusas, 0), falhas: numero(falhas, 0) });
    }
  } catch (_) {
    return json({ erro: "contagem indisponível" }, 503, origem);
  }
  return json({ ligado: estado.ligado, restante: estado.restante, teto, dias }, 200, origem);
}

/* ---------------- provador: a geração ---------------- */

const MODELO = "gemini-nano-banana-2.1";

function paraBase64(buffer) {
  const u = new Uint8Array(buffer);
  let texto = "";
  const passo = 0x8000;   // de uma vez só, String.fromCharCode estoura a pilha
  for (let i = 0; i < u.length; i += passo) {
    texto += String.fromCharCode.apply(null, u.subarray(i, i + passo));
  }
  return btoa(texto);
}

/* O navegador manda só o slug. Quem decide qual arquivo ler é o Worker,
   pelo catálogo: dois dos itens têm img diferente de p/<slug>.jpg porque o
   painel renomeia ao trocar a foto, e aceitar caminho de fora transformaria
   esta rota pública num leitor de arquivo do repositório. */
async function renderDe(req, env, ctx, slug) {
  if (!/^[a-z0-9-]{2,60}$/.test(slug || "")) return null;
  const resposta = await catalogoPublico(req, env, ctx);
  if (!resposta.ok) return null;
  const catalogo = await resposta.json();
  const item = (catalogo.itens || []).find(x => x.slug === slug);
  if (!item) return null;
  const pecas = Object.values(item.tamanhos || {}).reduce((a, q) => a + (q > 0 ? q : 0), 0);
  if (!(item.preco > 0) || !pecas) return null;              // peça de arquivo não se prova
  if (!/^p\/[a-z0-9-]+\.jpg$/.test(item.img || "")) return null;
  const img = await fetch(`https://raw.githubusercontent.com/${env.REPO}/${env.BRANCH}/${item.img}`);
  if (!img.ok) return null;
  return { base64: paraBase64(await img.arrayBuffer()), item };
}

/* O texto é a única alavanca de fidelidade que um modelo de imagem geral
   oferece: ele nomeia a peça e lista o que não pode mudar. */
function pedido(item) {
  return [
    `Foto de catálogo de moda fitness.`,
    `A primeira imagem é uma pessoa. A segunda é a peça "${item.kind} ${item.name}" da marca LBA, fotografada sem corpo, sobre fundo claro.`,
    `Vista a pessoa da primeira imagem com exatamente essa peça.`,
    `Preserve da segunda imagem, sem alterar: as cores exatas, a ordem e a posição de cada faixa, listra, recorte ou detalhe, o formato do decote e das alças, a altura do cós e o comprimento da peça.`,
    `Preserve da primeira imagem: o rosto, o cabelo, o tom de pele, o corpo e a pose da pessoa.`,
    `Resultado em corpo inteiro, fundo de estúdio claro e liso, luz suave e uniforme, sem texto e sem marca d'água.`
  ].join(" ");
}

async function chamarGemini(env, fotoB64, renderB64, item) {
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": env.GEMINI_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      model: MODELO,
      input: [
        { type: "image", mime_type: "image/jpeg", data: fotoB64 },
        { type: "image", mime_type: "image/jpeg", data: renderB64 },
        { type: "text", text: pedido(item) }
      ],
      response_format: { type: "image", aspect_ratio: "3:4", image_size: "1K" }
    })
  });
  // Erro de transporte não é recusa de conteúdo. Misturar os dois faria a
  // cliente ver "tenta outra foto" quando o problema é cota ou faturamento.
  if (!r.ok) return { imagem: null, falha: true, detalhe: `http ${r.status}: ${(await r.text()).slice(0, 200)}` };
  const d = await r.json().catch(() => null);
  for (const passo of (d && d.steps) || []) {
    if (passo.type !== "model_output") continue;
    for (const bloco of passo.content || []) {
      if (bloco.type === "image" && bloco.data) return { imagem: bloco.data, detalhe: "" };
    }
  }
  // Resposta boa, sem bloco de imagem: aí sim é recusa de filtro.
  return { imagem: null, falha: false, detalhe: "sem imagem na resposta" };
}

async function provar(req, env, ctx) {
  const O = "*";
  if (!provadorLigado(env))
    return json({ erro: "o provador está desligado", codigo: "desligado" }, 503, O);

  const corpo = await req.json().catch(() => ({}));
  const { slug, foto, teste } = corpo;
  if (!foto || typeof foto !== "string")
    return json({ erro: "faltou a foto", codigo: "falhou" }, 400, O);
  if (foto.length > 4_000_000)
    return json({ erro: "imagem grande demais", codigo: "falhou" }, 400, O);

  /* A peça é conferida ANTES de reservar vaga. Reservar primeiro deixaria
     qualquer um derrubar o provador pelo dia inteiro com 40 requisições de
     slug inválido, sem gastar um centavo — e sem nenhuma chamada sair. Ler
     o catálogo é de graça: vem do cache de borda. */
  const alvo = await renderDe(req, env, ctx, slug);
  if (!alvo) return json({ erro: "peça indisponível para provar", codigo: "slug" }, 404, O);

  // Via de teste: teto próprio, para afinar o texto sem fechar o provador.
  const ehTeste = !!env.PROVADOR_TESTE && teste === env.PROVADOR_TESTE;
  if (ehTeste) {
    try {
      if (!(await somar(env, `teste:${hojeSP()}`, 100, DIAS_CONTADOR)))
        return json({ erro: "teto de teste atingido", codigo: "teto" }, 429, O);
    } catch (_) {
      return json({ erro: "contador indisponível", codigo: "teto" }, 503, O);
    }
  } else {
    const vaga = await reservarVaga(env, req.headers.get("cf-connecting-ip") || "sem-ip");
    if (!vaga.ok) {
      const codigo = vaga.motivo === "kv" ? "teto" : vaga.motivo;
      return json({ erro: "limite atingido", codigo }, codigo === "desligado" ? 503 : 429, O);
    }
  }

  const { imagem, falha, detalhe } = await chamarGemini(env, foto, alvo.base64, alvo.item);
  if (!imagem) {
    await registrar(env, falha ? "falhas" : "recusas");
    return falha
      ? json({ erro: "o provador está com problema", codigo: "falhou", detalhe }, 502, O)
      : json({ erro: "não consegui gerar com essa foto", codigo: "recusado" }, 200, O);
  }
  await registrar(env, "provas");
  return json({ imagem }, 200, O);
}

/* ---------------- rotas ---------------- */

async function lerCatalogo(req, env, origem) {
  await exigeSessao(req, env);
  const { conteudo, sha } = await lerArquivo(env, "dados/catalogo.json");
  if (!conteudo) return json({ erro: "dados/catalogo.json não encontrado" }, 404, origem);
  return json({ catalogo: JSON.parse(conteudo), sha }, 200, origem);
}

/* O site lê daqui. Guardado na borda por 60s para não bater no GitHub a cada
   visita — e o cache é derrubado na hora em que o painel grava, então uma
   alteração aparece imediatamente. */
function urlPublica(req) {
  const u = new URL(req.url);
  u.pathname = "/catalogo.json";
  u.search = "";
  return u.toString();
}

async function catalogoPublico(req, env, ctx) {
  const cache = caches.default;
  const chave = new Request(urlPublica(req), { method: "GET" });
  const guardado = await cache.match(chave);
  if (guardado) return guardado;

  const { conteudo } = await lerArquivo(env, "dados/catalogo.json");
  if (!conteudo) return json({ erro: "catálogo não encontrado" }, 404, "*");

  const r = new Response(conteudo, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60",
      "access-control-allow-origin": "*"
    }
  });
  if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(chave, r.clone()));
  return r;
}

async function derrubarCache(req) {
  try { await caches.default.delete(new Request(urlPublica(req), { method: "GET" })); } catch (_) {}
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
  await derrubarCache(req);   // o site passa a ver a mudança na próxima visita
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
