# Contribuindo com o ImmuHen

Obrigado pelo interesse em contribuir com o ImmuHen.

## Antes de começar

1. Leia o `README.md` para entender a arquitetura e o modo de execução.
2. Nunca envie arquivos `.env`, credenciais, tokens, dumps do banco ou dados reais de granjas.
3. Crie uma branch específica para sua alteração.

## Fluxo recomendado

```bash
git checkout -b feat/minha-alteracao

# faça a alteração e valide localmente
cd backend && node --check index.js
cd ../frontend && npm run build
cd ../vaccinator-app && npm run build

git add .
git commit -m "tipo: descreve a alteração"
git push origin feat/minha-alteracao
```

Abra um Pull Request explicando o problema, a solução e como a alteração foi testada.

## Padrão de commits

Prefira mensagens curtas e claras, por exemplo:

- `feat: adiciona filtro de vacinações concluídas`
- `fix: corrige validação do programa de vacinação`
- `docs: atualiza instruções de deploy`
- `chore: atualiza dependências`

## Checklist do Pull Request

- [ ] A alteração foi testada localmente.
- [ ] O build do frontend foi executado.
- [ ] O build do app do vacinador foi executado, quando aplicável.
- [ ] Nenhum segredo ou dado real foi adicionado.
- [ ] A documentação foi atualizada, quando necessário.
