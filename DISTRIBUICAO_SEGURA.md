# Distribuicao segura do ImmuHen

## O que entregar ao cliente

Para o cliente da granja, entregue somente:

- `frontend/dist` servido como app web/PWA.
- `vaccinator-app/dist` servido como app web/PWA do vacinador.
- Backend empacotado ou rodando como servico.
- Arquivo `.env` de producao protegido.

Nao entregue a pasta `src`, `backend/index.js`, `node_modules` de desenvolvimento, nem este repositorio inteiro.

Importante: se o backend ficar instalado no computador da granja, nenhum sistema em JavaScript fica 100% impossivel de engenharia reversa. O bloqueio forte de verdade e hospedar o backend e o banco em um servidor seu, deixando no computador/celular da granja somente o app cliente. Para venda local, use build minificado, conta Windows sem administrador, pasta com permissao restrita e backend como servico.

## Variaveis do servidor

Crie um `.env` no servidor/backend com:

```env
PORT=3001
AUTH_SECRET=troque-por-uma-chave-grande
OWNER_ADMIN_KEY=sua-senha-de-dono
SUBSCRIPTION_ADMIN_KEY=sua-chave-para-renovar-manual
MP_ACCESS_TOKEN=APP_USR-ou-TEST-seu-token-do-mercado-pago
API_PUBLIC_URL=https://seu-dominio-api.com
FRONTEND_PUBLIC_URL=https://seu-dominio-granja.com
SUBSCRIPTION_PRICE=99.90
SUBSCRIPTION_CURRENCY=BRL
CORS_ORIGIN=https://seu-dominio-granja.com,https://seu-dominio-vacinador.com
```

No teste local, `API_PUBLIC_URL` pode ficar vazio, mas o Mercado Pago nao conseguira chamar webhook no seu computador sem um tunel publico.

## Onde gerenciar dados

Use o painel protegido do dono:

```text
http://localhost:3001/owner-admin
```

Entre com a senha `OWNER_ADMIN_KEY`. Ali voce ve:

- granjas cadastradas;
- emails das contas;
- vacinadores;
- solicitacoes;
- status da mensalidade;
- botoes de renovar/bloquear;
- redefinicao de senha;
- exclusao de usuario de acesso.

As senhas nao aparecem em texto puro. Isso e intencional: o correto e redefinir senha, nao visualizar senha.

## Administrar da sua casa

Para voce administrar todas as granjas de casa, o backend e o banco precisam ficar em um servidor central seu, por exemplo:

```text
https://api.vacitech.com.br
```

Nesse modelo, voce acessa:

```text
https://api.vacitech.com.br/owner-admin
```

E todos os aplicativos instalados nas granjas usam essa mesma API central. Assim, quando uma granja cadastra usuario, vacinador, agendamento ou pagamento, os dados ja aparecem no painel do dono.

Se o backend ficar instalado somente no computador da granja, sua casa nao consegue acessar os dados automaticamente, a menos que exista VPN, tunel seguro ou porta aberta no roteador da granja. Para venda como SaaS, o recomendado e manter o backend centralizado em servidor seu e instalar nas granjas apenas o app/PWA apontando para a sua API.

## Mercado Pago

No painel de desenvolvedores do Mercado Pago:

1. Crie uma aplicacao.
2. Copie o Access Token de producao.
3. Cadastre sua chave Pix na conta Mercado Pago.
4. Coloque o token em `MP_ACCESS_TOKEN`.
5. Configure o webhook para:

```text
https://seu-dominio-api.com/api/payments/mercadopago/webhook
```

O sistema cria Pix pela API do Mercado Pago e, quando o pagamento chega aprovado pelo webhook, renova a mensalidade da granja.

## Instalar como app

Os dois frontends estao preparados como PWA:

- ImmuHen: `http://IP_DO_SERVIDOR:5173`
- Vacinador: `http://IP_DO_SERVIDOR:5174`

No celular: abra no Chrome/Edge/Safari e toque em `Adicionar a tela inicial`.

No computador: abra no Chrome/Edge e use o icone de instalar na barra do navegador.

## Rodar em rede local

```bash
cd backend
npm run start
```

```bash
cd frontend
npm run dev:network
```

```bash
cd vaccinator-app
npm run dev
```

Depois acesse pelo IP do computador servidor, por exemplo:

```text
http://192.168.1.18:5173
http://192.168.1.18:5174
```

## Melhor arquitetura para vender SaaS

O recomendado para vender em escala:

- backend e banco em servidor seu;
- Mercado Pago/webhook no servidor seu;
- apps instalaveis por PWA nos clientes;
- cada granja tem uma conta e tenant;
- computadores das granjas nunca recebem codigo fonte nem banco completo.
