# Catálogo LBA Fitwear

**No ar:** https://dvseiffert.github.io/lba-catalogo/

Site de catálogo estático. Uma pasta, sem build, sem dependências.

```
index.html     a página inteira (HTML + CSS + JS + dados embutidos)
p/             78 renders 3D otimizados + o logo
v/             os dois giros 360° (Bari e Valência) + posters
```

## Como atualizar o site

Já está publicado no GitHub Pages, servido do branch `main` deste
repositório. Para colocar qualquer mudança no ar:

```bash
git add -A && git commit -m "atualiza catálogo" && git push
```

O Pages reconstrói sozinho em 1 ou 2 minutos.

Se um dia quiser trocar de hospedagem, qualquer serviço de arquivo
estático serve (Netlify, Vercel, Cloudflare Pages) — é só apontar para
esta pasta. Não precisa de servidor nem de etapa de build.

Para usar um domínio próprio (ex.: catalogo.lbafitwear.com.br), aponte
um CNAME para `dvseiffert.github.io` e cadastre o domínio em
Settings → Pages no repositório.

## Estoque

A página tenta ler o estoque direto da API da loja NextFit ao carregar:

- deu certo → o cabeçalho mostra **estoque ao vivo**, com preços,
  tamanhos e quantidades do momento;
- falhou (sem internet, ou a API mudou) → cai no snapshot embutido
  de 11 nov 2026 e o cabeçalho diz **estoque de 11 nov 2026**.

Ou seja: hospedado, ele se atualiza sozinho. Você nunca precisa mexer
em preço ou disponibilidade na mão.

> A API é `apiappaluno.nextfit.com.br/.../RecuperarItens/<id-da-loja>`.
> O id da loja está no topo do `<script>` do `index.html`, em `API` e `STORE`.

## Como o catálogo se liga à loja

Cada render tem uma chave (`key`) na constante `CATALOG`, dentro do
`index.html`. Ela é o nome do produto na loja **sem o tamanho**, em
minúsculas e sem acento:

| Render             | key na loja                   |
|--------------------|-------------------------------|
| `p/lyon-short.jpg` | `conjunto short lyon`         |
| `p/lyon-calca.jpg` | `conjunto calca lyon`         |
| `p/granada.jpg`    | `corta vento granada`         |
| `p/top-high.jpg`   | `top high`                    |

Render com `key: null` não tem estoque na loja: aparece só na aba
**Ver tudo**, dessaturado e marcado como **Esgotado**.

## Foto do hero

`p/hero.jpg` é um recorte de
`Fotos/Fotos Dia 5 - Coleção 3/Edited-D5-C3/LBA-Lyon-18.jpg` (2496×3744),
cortado em 2496×3328 e reduzido para 1300×1733.

Para trocar a foto: exporte na mesma proporção (~3:4), salve por cima de
`p/hero.jpg` e pronto. Se a modelo ficar mal enquadrada, ajuste o
`object-position` de `.hero-photo img` no `index.html` — são dois
valores, um para desktop e um dentro do `@media (max-width:1000px)`.

As bordas da foto derretem no fundo por gradiente, não por recorte. Por
isso a foto precisa ter margem sobrando nas laterais: o degradê come os
primeiros 56% da largura dela no desktop.

## Tema

O site é escuro sempre, em qualquer aparelho — fundo `#0C0C0E`, fixo no
bloco `:root`. Não existe versão clara: as placas dos produtos são
claras porque essa é a cor do fundo dos próprios renders.

## Peças avulsas (coleção França)

Os conjuntos da França também são vendidos peça por peça. Isso não vem
da loja — está fixo no `index.html`, na constante `AVULSO`:

```js
const AVULSO = {
  "Conjunto calça": [{ n:"Top", art:"o top", v:120 }, { n:"Calça", art:"a calça", v:195 }],
  "Conjunto short": [{ n:"Top", art:"o top", v:120 }, { n:"Short", art:"o short", v:165 }]
};
```

Vale para qualquer item com `col: "franca"` cujo `kind` esteja nessa
lista — hoje, 11 dos 13 modelos. Os dois macacões (Marselha e
Estrasburgo) ficam de fora porque não dá para separar.

As avulsas somam exatamente o preço do conjunto (120+195=315,
120+165=285), e o site diz isso na ficha. Se você mudar um preço e a
soma deixar de bater, a frase some sozinha — não vira informação falsa.

Como a loja não cadastra as avulsas, cada uma abre o WhatsApp com a
mensagem já escrita. Para liberar avulsas em outra coleção, troque o
`i.col === "franca"` da função `avulsasDe`.

## Quando entrar coleção nova

1. Exporte os renders em 1080×1350 e jogue em `p/` com um nome-slug
   (`p/nova-peca.jpg`).
2. Em `index.html`, procure `const CATALOG =` e acrescente o item:
   `{"slug":"nova-peca","col":"franca","name":"Nova Peça","kind":"Conjunto short","key":"conjunto short nova peca","img":"p/nova-peca.jpg"}`
3. `col` aceita: `espanha`, `italia`, `franca`, `essenciais`.
4. Se a peça tiver vídeo 360°, coloque o mp4 em `v/` e adicione
   `"spin":"nome-do-arquivo"` (sem a extensão).

Preço e tamanhos não precisam ser escritos — vêm da loja.
