# ImmuHen Vacinador

Aplicativo separado para o vacinador, vinculado ao ImmuHen pela API do backend.
Ele tambem foi preparado como PWA, entao pode ser instalado na tela inicial do celular quando estiver publicado em HTTPS.

## Rodar localmente

Em terminais separados:

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev -- --host 0.0.0.0 --port 5173
```

```bash
cd vaccinator-app
npm run dev
```

URLs padrao:

- ImmuHen: `http://localhost:5173`
- ImmuHen Vacinador: `http://localhost:5174`
- API: `http://localhost:3001`

## Entrar mesmo estando longe

Para funcionar fora da rede da granja, o backend do ImmuHen precisa ficar publicado em uma URL acessivel pela internet. Nao pode ser `localhost`, nem IP do Wi-Fi.

Exemplo de URL publica da API:

```bash
https://api.sua-granja.com
```

No backend, use estas variaveis de ambiente na hospedagem:

```bash
PORT=3001
DATABASE_URL=postgresql://usuario:senha@host:5432/granja
CORS_ORIGIN=https://app-vacinador.sua-granja.com,https://granja-system.sua-granja.com
SUBSCRIPTION_ADMIN_KEY=troque-esta-chave
```

O comando de producao do backend e:

```bash
npm start
```

Depois configure o app do vacinador com essa URL:

```bash
cp .env.example .env
```

No arquivo `.env`:

```bash
VITE_API_URL=https://api.sua-granja.com
```

Entao gere a versao de producao:

```bash
npm run build
```

Publique a pasta `dist` em um dominio HTTPS. No celular, abra o dominio do app e toque em `Instalar app no celular`.

Importante: se o app estiver publicado em HTTPS, a API tambem deve usar HTTPS. Navegadores de celular bloqueiam chamadas de um app HTTPS para uma API HTTP.

Resumo do que precisa ficar online:

- Backend do ImmuHen: `https://api.sua-granja.com`
- Painel da granja: `https://granja-system.sua-granja.com`
- App do vacinador: `https://app-vacinador.sua-granja.com`

## Assinatura mensal

O backend controla a assinatura. Se vencer, o app do vacinador apenas mostra que a assinatura venceu e bloqueia o uso.

O pagamento e a renovacao ficam no ImmuHen ou no painel administrativo do dono, nao no app do vacinador.

## Testar no celular na mesma rede

1. Descubra o IP do computador na rede Wi-Fi com `ipconfig`.
2. No celular, abra `http://IP_DO_COMPUTADOR:5174`.
3. No computador, use o ImmuHen em `http://localhost:5173`.
4. Cadastre a granja, cadastre um vacinador com email/telefone, e crie um agendamento.
5. No celular, entre com o mesmo email e telefone do vacinador.

Se o celular nao abrir, libere as portas `3001`, `5173` e `5174` no firewall do Windows.
