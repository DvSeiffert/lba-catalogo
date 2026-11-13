# Ligar o painel — passo a passo

O painel em `lbafitwear.com.br/admin/` já está no ar, mas sozinho ele não
faz nada: falta a função que valida a senha e grava no repositório. São
duas coisas para criar, uma no GitHub e uma na Cloudflare. Leva uns 5
minutos e é só uma vez.

Nada aqui exige instalar programa nem usar terminal.

---

## 1. Criar o token do GitHub

Serve para a função poder gravar no repositório. Ele fica guardado na
Cloudflare e **nunca chega ao navegador de quem usa o painel**.

1. Entre em **github.com → Settings → Developer settings →
   Personal access tokens → Fine-grained tokens → Generate new token**.
2. Preencha:
   - **Token name:** `painel-catalogo-lba`
   - **Expiration:** 1 ano (anote para renovar)
   - **Repository access:** *Only select repositories* → `lba-catalogo`
   - **Permissions → Repository permissions → Contents:** *Read and write*
3. **Generate token** e copie o código que aparece (começa com
   `github_pat_`). Ele só é mostrado uma vez.

> Esse token só consegue mexer nos arquivos desse repositório. Não dá
> acesso à sua conta, a outros repositórios, nem a nada de pagamento.

## 2. Criar a função na Cloudflare

1. Entre em **dash.cloudflare.com** → menu lateral **Workers & Pages** →
   **Create** → **Create Worker**.
2. Nome: `lba-admin`. Clique em **Deploy** (ele cria um exemplo vazio).
3. Clique em **Edit code**. Apague tudo o que estiver lá e cole o
   conteúdo do arquivo `admin/worker.js` deste repositório.
4. **Deploy** de novo.

## 3. Configurar as variáveis

Ainda no Worker: **Settings → Variables and Secrets**.

Adicione estas seis. As três primeiras como **Secret** (fica escondido),
as três últimas como **Text**:

| Nome | Tipo | Valor |
|------|------|-------|
| `SENHA` | Secret | a senha que a equipe vai digitar |
| `GITHUB_TOKEN` | Secret | o token do passo 1 |
| `SEGREDO` | Secret | qualquer texto aleatório longo (assina a sessão) |
| `REPO` | Text | `DvSeiffert/lba-catalogo` |
| `BRANCH` | Text | `main` |
| `ORIGEM` | Text | `https://lbafitwear.com.br` |

Clique em **Deploy** para valer.

> Para o `SEGREDO`, sirva-se de qualquer coisa difícil de adivinhar, com
> 30+ caracteres. Ele não precisa ser memorizado por ninguém.
>
> A `SENHA` é única e compartilhada pela equipe. Para trocar depois, é só
> editar essa variável — ninguém precisa reinstalar nada.

## 4. Pegar o endereço

Em **Settings → Domains & Routes** aparece o endereço, no formato
`https://lba-admin.ALGUMA-COISA.workers.dev`. Copie.

## 5. Primeiro acesso

1. Abra `https://lbafitwear.com.br/admin/`.
2. Cole o endereço do passo 4 (só pedido uma vez por aparelho).
3. Digite a senha.

Pronto. Se quiser, me mande o endereço que eu deixo ele já preenchido no
painel, para ninguém mais precisar colar.

---

## O que o painel faz

- **Cadastrar modelo novo** — foto, nome, coleção, tipo e a ligação com o
  produto na loja. A foto é reduzida para 860×1075 no próprio navegador
  antes de subir, então pode mandar o arquivo grande.
- **Editar** qualquer um dos modelos: trocar foto, corrigir nome, mudar
  coleção ou tipo.
- **Remover** do catálogo.
- **Testar na loja** — confere, na hora, se o nome digitado existe mesmo
  na NextFit. Esse é o campo que mais dá errado: se ele não bater, o card
  nasce como "Esgotado" mesmo havendo estoque.

Preço, tamanhos e disponibilidade continuam vindo da loja sozinhos. O
painel não mexe nisso.

## Depois de salvar

As alterações viram um commit no repositório e o GitHub Pages reconstrói
o site em **1 a 2 minutos**. Não é instantâneo.

Se duas pessoas abrirem o painel ao mesmo tempo, quem salvar depois
recebe um aviso para recarregar em vez de apagar o trabalho da outra.

## Limites conhecidos

- **Uma senha só**, compartilhada. Não há usuário por pessoa nem registro
  de quem alterou o quê — o histórico fica nos commits, todos em nome do
  token.
- **Sessão de 8 horas**; depois disso o painel pede a senha de novo.
- **Giros 360°** (`spin`) e a **foto do hero** não são editáveis pelo
  painel; continuam no código.
- O **estoque de tops avulsos** (`topEstoque`) também não; ainda é
  editado à mão no `dados/catalogo.json`.
