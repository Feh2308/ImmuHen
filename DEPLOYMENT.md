# Publicar o ImmuHen

Para o cliente nao precisar rodar nada no computador, o sistema precisa ficar hospedado.

Estrutura recomendada:

- API: `https://api.sua-granja.com`
- Painel da granja: `https://granja-system.sua-granja.com`
- App do vacinador: `https://app-vacinador.sua-granja.com`

## Backend

Variaveis de ambiente:

```bash
DATABASE_URL=postgresql://postgres.PROJECT_REF:SENHA@aws-0-REGIAO.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.PROJECT_REF:SENHA@aws-0-REGIAO.pooler.supabase.com:5432/postgres
PORT=3001
CORS_ORIGIN=https://granja-system.sua-granja.com,https://app-vacinador.sua-granja.com
SUBSCRIPTION_ADMIN_KEY=uma-chave-secreta-grande
AUTH_SECRET=outra-chave-secreta-grande-e-fixa
```

Comando de producao:

```bash
npm start
```

## Frontend e app do vacinador

Nos dois apps, configure:

```bash
VITE_API_URL=https://api.sua-granja.com
```

Depois gere:

```bash
npm run build
```

Publique a pasta `dist` de cada app em HTTPS.

## Cadastro por granja

O ImmuHen agora trabalha com uma conta por granja.

Fluxo de venda:

1. O cliente acessa `https://granja-system.sua-granja.com`.
2. Clica em `Cadastrar nova granja`.
3. Informa email, senha e dados do perfil da granja.
4. O sistema cria uma conta propria para aquela granja.
5. Tudo que ela cadastrar fica separado: perfil, vacinadores, agendamentos, solicitacoes, assinatura e pagamentos.

O email de acesso e unico. Se outra granja tentar cadastrar o mesmo email, o sistema bloqueia.

Importante: mantenha `AUTH_SECRET` sempre igual no servidor. Ela protege os tokens de login; se trocar, os usuarios apenas precisarao entrar novamente.

## Assinatura

O servidor cria uma assinatura mensal inicial. Quando vencer, o login e as APIs retornam erro de assinatura vencida.

## Mercado Pago

Sua chave Pix aleatoria pode continuar na sua conta Mercado Pago. Para o sistema validar pagamentos automaticamente, o que voce precisa colocar no servidor e o `Access Token` da aplicacao Mercado Pago.

Passo a passo:

1. Acesse `https://www.mercadopago.com.br/developers`.
2. Entre com a mesma conta Mercado Pago que voce usa no Gmail.
3. Crie uma aplicacao de `Checkout Pro`.
4. Abra `Suas integracoes` > sua aplicacao > `Credenciais de producao`.
5. Copie o `Access Token` de producao.
6. No backend publicado, configure:

```bash
MP_ACCESS_TOKEN=APP_USR-seu-access-token-de-producao
API_PUBLIC_URL=https://api.sua-granja.com
FRONTEND_PUBLIC_URL=https://granja-system.sua-granja.com
SUBSCRIPTION_PRICE=99.90
SUBSCRIPTION_CURRENCY=BRL
```

7. Em `Webhooks`, configure a URL:

```bash
https://api.sua-granja.com/api/payments/mercadopago/webhook
```

8. Selecione o evento de pagamentos.
9. Salve.

Quando o cliente clicar em `Pagar mensalidade`, ele vai para o Checkout Pro do Mercado Pago. Quando o pagamento for aprovado, o Mercado Pago chama o webhook acima e o backend libera mais um mes automaticamente.

Renovar:

```bash
POST https://api.sua-granja.com/api/subscription/renew
Header: x-admin-key: uma-chave-secreta-grande
Body: { "months": 1 }
```

Esse endpoint manual continua existindo para emergencia ou atendimento direto, mas a venda normal deve passar pelo botao `Pagar mensalidade`.
