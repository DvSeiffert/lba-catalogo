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

Render com `key: null` é peça de arquivo: aparece só na aba **Acervo**,
dessaturada, sem preço.

## Quando entrar coleção nova

1. Exporte os renders em 1080×1350 e jogue em `p/` com um nome-slug
   (`p/nova-peca.jpg`).
2. Em `index.html`, procure `const CATALOG =` e acrescente o item:
   `{"slug":"nova-peca","col":"franca","name":"Nova Peça","kind":"Conjunto short","key":"conjunto short nova peca","img":"p/nova-peca.jpg"}`
3. `col` aceita: `espanha`, `italia`, `franca`, `essenciais`.
4. Se a peça tiver vídeo 360°, coloque o mp4 em `v/` e adicione
   `"spin":"nome-do-arquivo"` (sem a extensão).

Preço e tamanhos não precisam ser escritos — vêm da loja.
