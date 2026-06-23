# Deploy automatico do ImmuHen via GitHub Actions

Este deploy atualiza a VPS quando houver `git push` na branch `main`.

O workflow nao roda seed, nao roda `prisma migrate reset` e nao executa migrations. Ele faz apenas:

- `git pull --ff-only origin main`
- `npm ci` ou `npm install`
- `npx prisma generate`
- build do frontend
- build do app do vacinador
- copia dos arquivos para `/var/www/immuhen`
- restart do PM2
- reload do Nginx

## Secrets no GitHub

Configure em `Settings > Secrets and variables > Actions > New repository secret`:

```txt
VPS_HOST=187.127.2.184
VPS_PORT=22
VPS_USER=deploy
VPS_SSH_KEY=conteudo_da_chave_privada_exclusiva_deploy
```

Use um usuario exclusivo, por exemplo `deploy`. Evite usar a chave SSH pessoal.

## Criar chave SSH exclusiva no seu computador

No seu computador:

```bash
ssh-keygen -t ed25519 -C "github-actions-immuhen-deploy" -f ~/.ssh/immuhen_github_actions
```

Isso cria:

```txt
~/.ssh/immuhen_github_actions
~/.ssh/immuhen_github_actions.pub
```

No GitHub, em `VPS_SSH_KEY`, cole o conteudo da chave privada:

```bash
cat ~/.ssh/immuhen_github_actions
```

Na VPS, adicione a chave publica ao usuario de deploy:

```bash
sudo adduser deploy
sudo usermod -aG www-data deploy
sudo mkdir -p /home/deploy/.ssh
sudo nano /home/deploy/.ssh/authorized_keys
```

Cole o conteudo de:

```bash
cat ~/.ssh/immuhen_github_actions.pub
```

Ajuste permissoes:

```bash
sudo chown -R deploy:deploy /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

## Permissoes seguras na VPS

O usuario `deploy` precisa conseguir atualizar o projeto, publicar arquivos e recarregar Nginx.

```bash
sudo chown -R deploy:deploy /opt/immuhen/current
sudo mkdir -p /var/www/immuhen/frontend /var/www/immuhen/vaccinator /var/www/immuhen/releases
sudo chown -R deploy:www-data /var/www/immuhen
sudo chmod -R 775 /var/www/immuhen
```

Permita somente validacao e reload do Nginx sem senha:

```bash
sudo visudo -f /etc/sudoers.d/immuhen-deploy
```

Conteudo:

```txt
deploy ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /bin/systemctl reload nginx
```

Se o caminho do `nginx` ou `systemctl` for diferente, confira com:

```bash
which nginx
which systemctl
```

## PM2

O processo deve rodar com o mesmo usuario `deploy`:

```bash
su - deploy
cd /opt/immuhen/current/backend
pm2 start index.js --name immuhen-api
pm2 save
```

Se o PM2 foi criado com outro usuario, recrie ou ajuste para o `deploy`, senao o GitHub Actions nao conseguira reiniciar.

## Env da VPS

Mantenha estes arquivos diretamente na VPS. Eles nao devem ser commitados:

```txt
/opt/immuhen/current/backend/.env
/opt/immuhen/current/frontend/.env.production
/opt/immuhen/current/vaccinator-app/.env.production
```

Exemplo `frontend/.env.production` para IP:

```env
VITE_API_URL=http://187.127.2.184
VITE_VACCINATOR_APP_URL=http://187.127.2.184/vacinador
VITE_ENABLE_PAYMENTS=false
```

Exemplo `vaccinator-app/.env.production` para IP:

```env
VITE_API_URL=http://187.127.2.184
VITE_BASE_PATH=/vacinador/
```

## Rollback basico

Durante o deploy, o workflow cria backup em:

```txt
/var/www/immuhen/releases/YYYYMMDDHHMMSS
```

Se algo falhar, ele tenta:

- voltar o Git para o commit anterior;
- restaurar frontend e app do vacinador do backup;
- reiniciar `immuhen-api`;
- recarregar Nginx.

Rollback manual:

```bash
cd /opt/immuhen/current
git log --oneline -5
git checkout --force COMMIT_ANTERIOR

rsync -a --delete /var/www/immuhen/releases/PASTA_DO_BACKUP/frontend/ /var/www/immuhen/frontend/
rsync -a --delete /var/www/immuhen/releases/PASTA_DO_BACKUP/vaccinator/ /var/www/immuhen/vaccinator/

pm2 restart immuhen-api
sudo nginx -t
sudo systemctl reload nginx
```

## Validacao depois do deploy

```bash
pm2 status
pm2 logs immuhen-api --lines 80
sudo nginx -t
curl -I http://127.0.0.1:3001/login
curl -I http://187.127.2.184/
curl -I http://187.127.2.184/vacinador/
```

No navegador, valide:

- `http://187.127.2.184/`
- `http://187.127.2.184/vacinador/`
- login do sistema principal;
- menu de vacinadores, botao abrir app, copiar link e QR Code;
- PM2 sem erro.
