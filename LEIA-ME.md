# Catálogo LBA Fitwear

**No ar:** https://lbafitwear.com.br

O endereço antigo `dvseiffert.github.io/lba-catalogo` continua válido e
redireciona para o domínio.

## Domínio

Registrado no **registro.br**, mas o DNS é servido pela **Cloudflare** —
os nameservers estão delegados para lá. Mexer em DNS no painel do
registro.br não tem efeito nenhum; tudo se faz na Cloudflare.

Registros que fazem o site funcionar:

| Tipo | Nome | Valor | Proxy |
|------|------|-------|-------|
| A | `@` | `185.199.108.153` | Somente DNS |
| A | `@` | `185.199.109.153` | Somente DNS |
| A | `@` | `185.199.110.153` | Somente DNS |
| A | `@` | `185.199.111.153` | Somente DNS |
| CNAME | `www` | `dvseiffert.github.io` | Somente DNS |

> O proxy da Cloudflare (nuvem laranja) tem de ficar **desligado** nos
> cinco. Ligado, o GitHub não consegue emitir o certificado e o site
> entra em loop de redirecionamento.

O arquivo `CNAME` na raiz é o que diz ao GitHub Pages qual é o domínio.
Não apague. Certificado HTTPS é do Let's Encrypt, renovado sozinho.

Site de catálogo estático. Uma pasta, sem build, sem dependências.

```
index.html          a página inteira (HTML + CSS + JS)
dados/catalogo.json os modelos, com preço e estoque — a fonte da verdade
admin/              o painel (index.html) e o Worker da Cloudflare
p/                  renders 3D otimizados + o logo + a foto do hero
v/                  os dois giros 360° (Bari e Valência) + posters
```

## Como atualizar o site

**O caminho normal é o painel**, em https://lbafitwear.com.br/admin/ —
preço, estoque, nome, foto e modelo novo, tudo por lá, e a mudança
aparece no site na hora. Ver `admin/LEIA-ME-WORKER.md`.

Para mexer no HTML, no CSS ou no texto da página, aí sim é no arquivo:

```bash
git add -A && git commit -m "atualiza catálogo" && git push
```

O Pages reconstrói sozinho em 1 ou 2 minutos.

Se um dia quiser trocar de hospedagem, qualquer serviço de arquivo
estático serve (Netlify, Vercel, Cloudflare Pages) — é só apontar para
esta pasta. Não precisa de servidor nem de etapa de build.

## De onde vem o catálogo

O site lê `https://lba-admin.lbafitwear.workers.dev/catalogo.json`, servido
pela função na Cloudflare. Ela enxerga o repositório na hora, então uma
alteração feita no painel aparece **imediatamente** — sem esperar o
GitHub Pages reconstruir.

Se a função não responder, o site cai para `dados/catalogo.json`, o
arquivo estático do próprio site. Esse arquivo é o mesmo conteúdo, só que
publicado pelo build, e é o que vale dentro do artifact, onde buscar
outro domínio é bloqueado.

A função guarda a resposta na borda por 60 segundos e derruba esse cache
assim que o painel grava. Isso evita bater no GitHub a cada visita sem
atrasar a atualização.

O site só aceita o formato atual: para ser usada, a resposta precisa ter
itens com o campo `tamanhos`. Se vier algo mais antigo, ele passa para a
fonte seguinte em vez de mostrar tudo esgotado. O painel tem a mesma
trava, e se recusa a abrir — gravar por cima apagaria preço e estoque.

> Foto recém-enviada é o único caso que ainda depende do build: o arquivo
> só existe no site depois dele. Até lá, a `<img>` cai para o
> `raw.githubusercontent.com`, então a imagem aparece do mesmo jeito.

## Estoque e preço

Tudo vem de `dados/catalogo.json`, gravado pelo painel. O catálogo não
fala mais com a loja NextFit — foi **desvinculado em 13/11/2026**. Preço,
promoção e quantidade por tamanho moram em cada item:

```json
{
 "slug": "lyon-short", "col": "franca", "name": "Lyon",
 "kind": "Conjunto short", "img": "p/lyon-short.jpg",
 "preco": 285.0,
 "tamanhos": { "P": 3, "M": 3, "G": 2, "GG": 1 }
}
```

- `preco` é o que se cobra hoje.
- `de` é opcional: o preço antigo. Só existe quando há promoção, e o card
  mostra o riscado e o selo de desconto. Tem de ser maior que `preco`.
- `tamanhos` guarda a quantidade de cada tamanho. Tamanho ausente ou em
  zero não aparece no site.

A regra de **à venda** é uma só, igual no site e no painel: tem `preco`
maior que zero **e** pelo menos uma peça em `tamanhos`. Faltando um dos
dois, o modelo aparece como **Esgotado** — fica fora da aba “À venda”,
sem preço e sem tamanhos, e o botão vira “Avise-me quando voltar”. Era
assim que as peças de arquivo funcionavam antes, com `key: null`.

O cabeçalho mostra a data de `atualizado`, que o painel grava sozinho a
cada gravação.

> O que a loja fazia sozinho agora é trabalho do painel: quando vender
> uma peça, baixe a quantidade lá. Em troca, o catálogo manda em si
> mesmo — preço, promoção e peça de arquivo não dependem mais de como o
> produto está cadastrado em outro sistema.

## Foto do hero

`p/hero-cat.jpg` vem de `LBA-Site-Cat.png` (1920×1080), só reduzido para
1600×900 e convertido para JPEG.

A foto é deitada (16:9) e o site a encaixa em dois formatos: um painel
vertical à direita no desktop e um quadrado no topo no celular. Funciona
porque as modelos estão no centro e sobra parede vazia nos dois lados —
é justamente essa margem que o degradê consome. Uma foto com alguém
encostado na borda não se comporta bem aqui.

Para trocar: exporte deitada com as pessoas centralizadas, salve com um
nome novo em `p/` e troque o `src` do `<img>` dentro de `.hero-photo`.
Nome novo em vez de sobrescrever evita que quem já visitou continue
vendo a foto antiga em cache.

> Cuidado para não confundir: `p/ronda.jpg`, `p/lyon-short.jpg` e afins
> são os renders 3D dos produtos, não fotos de modelo. Apagar qualquer
> um deles deixa um card do catálogo sem imagem.

Se a modelo ficar mal enquadrada, ajuste o `object-position` de
`.hero-photo img` no `index.html` — são dois valores, um para desktop e
um dentro do `@media (max-width:1000px)`.

As bordas da foto derretem no fundo por gradiente, não por recorte. Por
isso a foto precisa ter margem sobrando nas laterais: o degradê come os
primeiros 56% da largura dela no desktop.

## Tema

O site é escuro sempre, em qualquer aparelho — fundo `#0C0C0E`, fixo no
bloco `:root`. Não existe versão clara: as placas dos produtos são
claras porque essa é a cor do fundo dos próprios renders.

## Peças avulsas (coleção França)

Os conjuntos da França também são vendidos peça por peça. Os preços
estão em `avulso`, no `catalogo.json`:

```json
"avulso": {
 "Conjunto calça": [{"n":"Top","art":"o top","v":120},
                    {"n":"Calça","art":"a calça","v":195}],
 "Conjunto short": [{"n":"Top","art":"o top","v":120},
                    {"n":"Short","art":"o short","v":165}]
}
```

Vale para qualquer item com `col: "franca"` cujo `kind` esteja nessa
lista — hoje, 11 dos 13 modelos. Os dois macacões (Marselha e
Estrasburgo) ficam de fora porque não dá para separar.

As avulsas somam exatamente o preço do conjunto (120+195=315,
120+165=285), e o site diz isso na ficha. Se um preço mudar e a soma
deixar de bater, a frase some sozinha — não vira informação falsa.

Cada avulsa abre o WhatsApp com a mensagem já escrita. Para liberar
avulsas em outra coleção, troque o `i.col === "franca"` da função
`avulsasDe`, no `index.html`.

### Tamanhos das avulsas

A ficha mostra quais tamanhos existem de cada peça solta:

- **Short / calça** — é o próprio conjunto, então sai do `tamanhos` do
  item.
- **Top** — tem contagem própria, em `topEstoque`, indexada pelo **nome
  do modelo** (`Lyon`), não pelo conjunto: o mesmo top serve o conjunto
  de short e o de calça. No painel, a ficha de um conjunto da França
  mostra essa grade logo abaixo da do conjunto, e o aviso lembra que ela
  é do modelo. Ao salvar, o painel descarta nome que não existe mais no
  catálogo.

Na planilha *Controle de Estoque* isso se confirma: o total de tops é
igual a short + calça em 15 dos 16 modelos.

## Quando entrar coleção nova

Pelo painel, em `/admin/`: **+ Novo modelo**. Ele pede a foto (reduz para
860×1075 ali mesmo), o nome, a coleção, o tipo, o preço e o estoque por
tamanho — e grava direto no repositório. Não precisa mexer em arquivo.

Na mão, se for preciso, acrescente o item em `dados/catalogo.json`:

```json
{"slug":"nova-peca","col":"franca","name":"Nova Peça","kind":"Conjunto short",
 "img":"p/nova-peca.jpg","preco":285.0,"tamanhos":{"P":2,"M":2}}
```

- `col` aceita: `espanha`, `italia`, `franca`, `essenciais`.
- Render em 1080×1350, em `p/`, com nome-slug.
- Se a peça tiver vídeo 360°, coloque o mp4 em `v/` e acrescente
  `"spin":"nome-do-arquivo"` (sem a extensão).
