# Catálogo LBA Fitwear

Site de catálogo estático. Uma pasta, sem build, sem dependências.

```
index.html     a página inteira (HTML + CSS + JS + dados embutidos)
p/             78 renders 3D otimizados + o logo
v/             os dois giros 360° (Bari e Valência) + posters
```

## Como publicar

Arraste esta pasta inteira para um destes:

- **Netlify Drop** — netlify.com/drop (mais rápido, link na hora)
- **Vercel** — `npx vercel --prod` dentro desta pasta
- **GitHub Pages** — suba a pasta no repositório e ative Pages

Qualquer hospedagem de arquivo estático serve. Não precisa de servidor.

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
