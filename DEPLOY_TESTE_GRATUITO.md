# Deploy gratuito de teste do ImmuHen

Este roteiro publica o ImmuHen para a granja acessar por link publico, inclusive por dados moveis.

Pagamento fica desligado neste teste. Quando o Mercado Pago estiver pronto, ligue novamente pelas variaveis de ambiente.

## Estrutura

- Banco: Supabase PostgreSQL
- Backend/API: Render Web Service
- Sistema da granja: Vercel
- App do vacinador: Vercel

## 1. Banco no Supabase

1. Crie uma conta em `https://supabase.com`.
2. Crie um projeto chamado `immuhen`.
3. Em `Project Settings` > `Database`, copie duas connection strings:
   - `DATABASE_URL`: Supabase transaction pooler, porta `6543`, com `?pgbouncer=true`.
   - `DIRECT_URL`: Supabase session/direct URL, porta `5432`, para migrations do Prisma.

Exemplo:

```env
DATABASE_URL=postgresql://postgres.PROJECT_REF:SENHA@aws-0-REGIAO.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.PROJECT_REF:SENHA@aws-0-REGIAO.pooler.supabase.com:5432/postgres
```

## 2. Backend no Render

1. Crie uma conta em `https://render.com`.
2. Clique em `New` > `Web Service`.
3. Conecte o repositorio privado do GitHub.
4. Configure:

```text
Root Directory: backend
Build Command: npm install && npx prisma generate && npx prisma migrate deploy
Start Command: npm start
```

5. Em `Environment`, adicione:

```env
DATABASE_URL=cole_a_url_pooler_6543_do_supabase
DIRECT_URL=cole_a_url_5432_do_supabase
VACITECH_STATE_STORAGE=database
SUBSCRIPTION_ENFORCEMENT=off
OWNER_ADMIN_KEY=crie_uma_senha_forte_para_voce
SUBSCRIPTION_ADMIN_KEY=crie_outra_senha_forte
AUTH_SECRET=crie_uma_chave_grande_aleatoria
CORS_ORIGIN=*
FRONTEND_PUBLIC_URL=https://temporario.vercel.app
API_PUBLIC_URL=https://temporario.onrender.com
SUBSCRIPTION_PRICE=99.90
SUBSCRIPTION_CURRENCY=BRL
NODE_VERSION=22
```

6. Clique em deploy.
7. Quando terminar, abra a URL do Render.
8. Se aparecer `Backend funcionando`, a API esta online.

Depois que os links da Vercel existirem, volte no Render e troque:

```env
CORS_ORIGIN=https://link-do-sistema.vercel.app,https://link-do-vacinador.vercel.app
FRONTEND_PUBLIC_URL=https://link-do-sistema.vercel.app
API_PUBLIC_URL=https://link-do-backend.onrender.com
```

Salve e faca redeploy.

## 3. Sistema da granja na Vercel

1. Crie conta em `https://vercel.com`.
2. Clique em `Add New` > `Project`.
3. Importe o mesmo repositorio.
4. Configure:

```text
Root Directory: frontend
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
```

5. Em Environment Variables:

```env
VITE_API_URL=https://link-do-backend.onrender.com
VITE_VACCINATOR_APP_URL=https://link-do-vacinador.vercel.app
VITE_ENABLE_PAYMENTS=false
```

6. Deploy.

## 4. App do vacinador na Vercel

Crie outro projeto na Vercel, usando o mesmo repositorio:

```text
Root Directory: vaccinator-app
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
```

Environment Variables:

```env
VITE_API_URL=https://link-do-backend.onrender.com
```

Deploy.

## 5. Teste real

No computador:

1. Abra o link do sistema da granja.
2. Cadastre uma nova granja.
3. Cadastre um vacinador.
4. Crie um programa de vacinacao.

No celular, usando dados moveis:

1. Abra o link do app do vacinador.
2. Entre com email e telefone cadastrados no sistema.
3. Confirme, inicie ou conclua a vacinacao.

## 6. Quando ativar pagamento

Quando tiver Mercado Pago:

Backend:

```env
SUBSCRIPTION_ENFORCEMENT=on
MP_ACCESS_TOKEN=seu_token_do_mercado_pago
API_PUBLIC_URL=https://api.immuhen.com.br
FRONTEND_PUBLIC_URL=https://app.immuhen.com.br
```

Frontend:

```env
VITE_ENABLE_PAYMENTS=true
```

Depois faca redeploy no Render e na Vercel.
