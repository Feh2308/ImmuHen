# ImmuHen

Sistema de gestão para granjas avícolas, com controle de vacinas, estoque, programas de vacinação, usuários, permissões, notificações, relatórios e aplicativo dedicado para vacinadores.

O projeto foi organizado em três partes:

- **Sistema da granja:** React + Vite, em `frontend/`.
- **Aplicativo do vacinador:** React + Vite, em `vaccinator-app/`.
- **API:** Node.js + Express + Prisma, em `backend/`.

> Importante: este repositório não deve conter senhas, tokens, chaves Pix, credenciais de e-mail ou URLs privadas. Configure esses valores somente no ambiente local ou na plataforma de hospedagem.

## Principais recursos

- Cadastro e separação de múltiplas granjas (multi-tenant).
- Usuários com diferentes perfis e permissões: administrador, gerente, funcionário e visualizador.
- Cadastro de vacinas, apresentações, fornecedores, doses, valores e estoque.
- Entradas, saídas, repasses e acompanhamento do estoque.
- Criação de programas de vacinação com vacinas sugeridas.
- Fluxo de confirmação e execução pelo aplicativo do vacinador.
- Registro de dias de vacinação, doses utilizadas, sobras e informações da execução.
- Relatórios e acompanhamento de vacinações.
- Notificações e mensagens por e-mail/WhatsApp mediante configuração dos serviços correspondentes.
- PWA para acesso pelo celular e instalação na tela inicial.
- Controle de assinatura e administração geral do sistema.

## Arquitetura recomendada

```text
Usuário/granja ───────► Vercel: frontend
Vacinador ────────────► Vercel: vaccinator-app
                              │
                              ▼
                        Railway: backend/API
                              │
                              ▼
                         Neon: PostgreSQL
```

O navegador conversa somente com a API. A conexão do banco fica no backend; nunca coloque `DATABASE_URL`, senha do PostgreSQL ou qualquer segredo em variáveis `VITE_*`.

## Requisitos

- Node.js 20 ou superior.
- npm 10 ou superior.
- PostgreSQL para o modo de produção.
- Git para versionamento.

Confira as versões instaladas:

```bash
node --version
npm --version
```

## Executar localmente

Abra três terminais na pasta raiz do projeto.

### 1. API

No PowerShell:

```powershell
cd backend
npm ci
Copy-Item .env.local.example .env.local
$env:IMMUHEN_ENV_FILE="$PWD/.env.local"
npm run dev
```

No Linux/macOS:

```bash
cd backend
npm ci
cp .env.local.example .env.local
IMMUHEN_ENV_FILE="$PWD/.env.local" npm run dev
```

A API ficará disponível em `http://localhost:3001`.

O exemplo local usa armazenamento em arquivo para facilitar testes. Os arquivos de dados locais não devem ser usados como banco de produção.

### 2. Sistema principal

```powershell
cd frontend
npm ci
$env:VITE_API_URL="http://localhost:3001"
npm run dev -- --host 0.0.0.0 --port 5173
```

Acesse: `http://localhost:5173`.

### 3. Aplicativo do vacinador

```powershell
cd vaccinator-app
npm ci
$env:VITE_API_URL="http://localhost:3001"
npm run dev
```

Acesse: `http://localhost:5174`.

O login do vacinador aceita o e-mail ou telefone cadastrado no sistema principal.

### Inicialização rápida

Também é possível usar o script auxiliar da raiz:

```powershell
./start-local.ps1
```

Se o Windows bloquear a execução do script:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
./start-local.ps1
```

## Configuração de ambiente

Use os arquivos de exemplo como referência:

- `backend/.env.example`: produção e banco de dados.
- `backend/.env.local.example`: testes locais.
- `frontend/.env.example`: sistema principal.
- `vaccinator-app/.env.example`: aplicativo do vacinador.

Variáveis mais importantes da API:

| Variável | Finalidade |
|---|---|
| `PORT` | Porta da API. A Railway pode sobrescrever esse valor. |
| `DATABASE_URL` | Conexão agrupada/pool do PostgreSQL. |
| `DIRECT_URL` | Conexão direta usada pelo Prisma nas migrações, quando necessária. |
| `VACITECH_STATE_STORAGE` | `file` para testes locais ou `database` em produção. |
| `BIRDLOTS_STORAGE` | `file` para testes locais ou `database` em produção. |
| `CORS_ORIGIN` | URLs autorizadas do sistema principal e do app do vacinador. |
| `AUTH_SECRET` | Chave longa e aleatória para autenticação. |
| `OWNER_ADMIN_KEY` | Chave privada do administrador geral. |
| `SUBSCRIPTION_ADMIN_KEY` | Chave usada na administração da assinatura. |
| `SUBSCRIPTION_ENFORCEMENT` | Use `off` em testes e `on` em produção. |
| `API_PUBLIC_URL` | URL pública da API. |
| `FRONTEND_PUBLIC_URL` | URL pública do sistema principal. |

Nunca publique os valores dessas variáveis. O arquivo `.env` já está ignorado pelo Git, mas confirme sempre o que será enviado antes do `git push`.

## Banco PostgreSQL e Prisma

Para usar PostgreSQL local ou Neon, configure `DATABASE_URL` e, se necessário, `DIRECT_URL` no `backend/.env`.

Depois execute:

```bash
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
```

Em desenvolvimento, não use `prisma migrate reset` em um banco com dados importantes: esse comando apaga dados.

## Deploy sem VPS

### Neon

1. Crie um projeto PostgreSQL.
2. Copie a string de conexão pooled para `DATABASE_URL`.
3. Copie a conexão direta para `DIRECT_URL`, se fornecida.
4. Não exponha nenhuma dessas strings no Vercel ou no navegador.

### Railway — API

Configure o serviço apontando para a pasta `backend`. O projeto já possui `Dockerfile` e `railway.json`.

Defina no Railway, com valores reais e secretos:

```text
DATABASE_URL=<conexao pooled do Neon>
DIRECT_URL=<conexao direta do Neon>
VACITECH_STATE_STORAGE=database
BIRDLOTS_STORAGE=database
CORS_ORIGIN=https://seu-front.vercel.app,https://seu-vacinador.vercel.app
API_PUBLIC_URL=https://seu-backend.up.railway.app
FRONTEND_PUBLIC_URL=https://seu-front.vercel.app
AUTH_SECRET=<chave longa aleatoria>
OWNER_ADMIN_KEY=<chave forte>
SUBSCRIPTION_ADMIN_KEY=<chave forte>
SUBSCRIPTION_ENFORCEMENT=on
```

Após a primeira publicação, execute as migrações no ambiente do backend:

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
```

### Vercel — sistema principal

Crie um projeto usando `frontend` como diretório raiz:

```text
Build command: npm run build
Output directory: dist
VITE_API_URL=https://seu-backend.up.railway.app
VITE_VACCINATOR_APP_URL=https://seu-vacinador.vercel.app
```

### Vercel — aplicativo do vacinador

Crie outro projeto usando `vaccinator-app` como diretório raiz:

```text
Build command: npm run build
Output directory: dist
VITE_API_URL=https://seu-backend.up.railway.app
VITE_BASE_PATH=/
```

Em produção, use HTTPS e informe as duas origens exatas no `CORS_ORIGIN` da API.

## Primeiro uso

1. Abra o sistema principal e crie a conta da granja.
2. Entre como administrador da granja.
3. Cadastre usuários e atribua permissões.
4. Confira o catálogo de vacinas e ajuste apresentações, doses, valores e estoque.
5. Cadastre o vacinador com e-mail e telefone.
6. Monte um programa de vacinação usando as vacinas sugeridas ou escolhendo-as manualmente.
7. Salve o programa para enviá-lo ao aplicativo do vacinador.
8. O vacinador acessa o app, vê o programa completo, abre os detalhes e confirma o plano.
9. Na data programada, o vacinador inicia cada dia, registra a execução e finaliza.
10. Consulte o acompanhamento e os relatórios no sistema principal.

## Administração geral

A página do administrador geral fica em:

```text
http://localhost:5173/admin-geral
```

Em produção, use o mesmo caminho na URL do frontend. A chave vem da variável `OWNER_ADMIN_KEY` configurada no backend. Não coloque essa chave no README, no GitHub, no frontend ou em mensagens públicas.

## E-mail e notificações

O remetente é configurado no backend. Para Gmail, use uma senha de app, nunca a senha normal da conta. Para Outlook/Hotmail, use as credenciais SMTP exigidas pela conta e pelo provedor.

Os destinatários podem usar Gmail, Outlook ou Hotmail; isso não exige uma conta de e-mail separada por granja. O remetente e o serviço SMTP ficam configurados no backend.

Para WhatsApp sem API oficial, o sistema pode abrir um link `wa.me`. Isso depende do WhatsApp estar instalado/logado e não equivale a uma integração oficial automatizada.

## PWA e funcionamento offline

O frontend possui suporte de instalação como PWA e pode manter a casca da aplicação disponível sem internet. Em produção, as operações que precisam conversar com outras granjas, enviar notificações ou atualizar o banco dependem da API e da conexão disponível.

Não coloque credenciais do Neon no PWA. Para sincronização offline completa, valide o fluxo de fila, reenvio e conflitos antes de anunciar essa capacidade como garantida.

## Verificações antes de publicar

Execute pelo menos:

```bash
cd backend
node --check index.js

cd ../frontend
npm run build

cd ../vaccinator-app
npm run build
```

Teste também:

- login de uma granja;
- criação de usuários com cada perfil;
- separação de dados entre duas granjas;
- criação, confirmação e execução de um programa;
- login do vacinador por e-mail e telefone;
- envio de e-mail com credenciais configuradas;
- bloqueio e reativação de assinatura;
- acesso pelo celular e instalação do PWA;
- banco, API e frontend em domínios diferentes;
- duas ou mais granjas usando o sistema ao mesmo tempo.

## Segurança para um repositório público

- Nunca faça commit de `.env`, `.env.local`, senhas, tokens, backups ou dumps do banco.
- Gere novas chaves para cada ambiente.
- Se alguma senha já foi compartilhada ou publicada, revogue-a e gere outra.
- Use HTTPS em produção.
- Restrinja `CORS_ORIGIN` às URLs oficiais.
- Mantenha dependências e sistema operacional atualizados.
- Faça backups do PostgreSQL e teste a restauração.
- Não use o armazenamento em arquivo como banco de produção.

## Licença

Este repositório ainda não declara uma licença de código aberto. Antes de aceitar cópias, contribuições ou uso comercial por terceiros, adicione um arquivo `LICENSE` com a licença escolhida.

## Status

O projeto está preparado para desenvolvimento local e para a arquitetura Vercel + Railway + Neon. Antes de considerar o sistema pronto para uso comercial, faça a validação final no ambiente publicado, especialmente autenticação, envio de e-mail, migrações, isolamento entre granjas, notificações e sincronização offline.

