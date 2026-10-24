# Deploy de producao do ImmuHen

## Enderecos

Compre apenas um dominio, por exemplo:

```text
vacitech.com.br
```

Crie estes subdominios no DNS:

```text
api.vacitech.com.br        -> IP do servidor
app.vacitech.com.br        -> IP do servidor
vacinador.vacitech.com.br  -> IP do servidor
```

## Pix e Mercado Pago

Cadastre sua chave Pix dentro da sua conta Mercado Pago. Nao coloque a chave Pix no codigo e nao coloque no frontend.

Depois crie uma aplicacao no Mercado Pago Developers e copie o `Access Token` de producao. Ele entra somente no arquivo do backend:

```env
MP_ACCESS_TOKEN=APP_USR-seu-access-token-de-producao
```

Webhook de producao:

```text
https://api.vacitech.com.br/api/payments/mercadopago/webhook
```

Fluxo da mensalidade:

```text
Granja clica em Renovar mensalidade
Sistema gera Pix no Mercado Pago
Cliente paga
Mercado Pago chama o webhook
Backend confirma pagamento aprovado
Sistema renova +1 mes automaticamente
```

## Arquivos para configurar no servidor

Copie os exemplos:

```bash
cp deploy/env/stack.env.example deploy/env/stack.env
cp deploy/env/backend.env.example deploy/env/backend.env
```

Preencha:

```text
deploy/env/stack.env
deploy/env/backend.env
```

Nunca envie esses arquivos para cliente e nunca publique em repositorio.

## Subir no servidor

No servidor Linux com Docker instalado:

```bash
cd /opt/vacitech/granja-system/deploy
docker compose --env-file env/stack.env -f docker-compose.prod.yml up -d --build
```

Depois acesse:

```text
https://api.vacitech.com.br/owner-admin
https://app.vacitech.com.br
https://vacinador.vacitech.com.br
```

O QR Code da pagina de vacinadores usa:

```env
VITE_VACCINATOR_APP_URL=https://vacinador.vacitech.com.br
```

No deploy Docker isso ja e gerado automaticamente a partir do `DOMAIN`.

## Seguranca minima do servidor

- Use SSH com chave, nao senha.
- Libere no firewall somente `22`, `80` e `443`.
- Use senha forte em `OWNER_ADMIN_KEY`.
- Deixe `MP_ACCESS_TOKEN` somente no backend.
- Nao instale o backend no computador da granja se voce quer administrar de casa.
- Mantenha backups do volume `postgres-data` e `vacitech-data`.
- Mantenha o repositorio privado.

## Observacao importante

Este deploy deixa o sistema pronto para operar online com HTTPS e acesso global. O banco PostgreSQL guarda as tabelas do Prisma, e o arquivo `vacitech-data.json` fica persistido em volume Docker. Para escalar com muitas granjas, o proximo passo ideal e migrar todos os dados multi-granja desse arquivo para PostgreSQL.
