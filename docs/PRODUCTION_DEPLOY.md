# Publicação em produção

O caminho recomendado para este monorepo é **Vercel** para a web Next.js/PWA, **Render** para a API NestJS e **Supabase** para autenticação, banco e imagens. A automação em [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) valida tipos, testes e os builds em todo pull request e em cada envio para `main`.

## Ordem de publicação

1. Envie este commit ao GitHub e confirme que o workflow **CI / Qualidade e build** ficou verde. Em **Settings > Branches**, torne esse check obrigatório antes de aceitar mudanças em `main`.
2. No Render, crie um **Web Service** a partir do repositório. Mantenha a raiz no repositório, e não em `apps/api`, pois a API depende do pacote compartilhado. Publique a API primeiro.
3. Copie a URL HTTPS da API e crie o projeto web na Vercel. Use `apps/web` como **Root Directory** e habilite a inclusão de arquivos fora dessa raiz, se a opção for exibida.
4. Copie a URL HTTPS final da Vercel de volta para `WEB_ORIGIN` no Render, faça redeploy da API e cadastre a mesma URL no Supabase. Se adotar domínio próprio, repita este passo usando o domínio definitivo.
5. Execute o checklist. HTTPS é obrigatório para instalação e recursos da PWA fora de `localhost`.

## Render — API

- **Build Command:** `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @nexo/shared build && pnpm --filter @nexo/api build`
- **Start Command:** `pnpm --filter @nexo/api start`
- **Health Check Path:** `/health`
- **Pre-Deploy Command (após o banco estar configurado):** `pnpm db:deploy`
- **Auto-Deploy:** branch `main`; prefira aguardar a conclusão dos checks do GitHub, quando a opção estiver disponível.

Crie no painel do Render, como segredos, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` e `ADMIN_IMPORT_KEY`. Crie como variáveis normais `NODE_ENV=production`, `WEB_ORIGIN=https://SEU-APP.vercel.app`, `SUPABASE_JWT_AUDIENCE=authenticated`, `SUPABASE_ESSAY_BUCKET=essay-images`, `AI_EVALUATIONS_PER_DAY=3` e, se usar imagens de provas persistidas, `EXAM_ASSET_PUBLIC_URL=https://SUA-API.onrender.com/exam-assets`.

`SUPABASE_JWT_SECRET` não é necessário para o Supabase atual, que assina tokens ES256 pela JWKS pública.

## Vercel — web/PWA

Configure estas variáveis para **Production** e **Preview** antes do primeiro deploy:

```dotenv
NEXT_PUBLIC_API_URL=https://SUA-API.onrender.com
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

Essas três chaves chegam ao navegador. Nunca crie uma variável `NEXT_PUBLIC_` para service-role, JWT secret, banco, Gemini ou chave administrativa. Sempre que `NEXT_PUBLIC_API_URL` mudar, faça novo deploy da web: o Next.js incorpora as variáveis públicas durante o build.

## Supabase

Em **Authentication > Providers**, deixe **Email** ativo, desabilite temporariamente **Confirm email** e marque **Disable signups**. A API cria contas pelo service-role já confirmadas, sem disparar e-mail de ativação. Configure SMTP para a recuperação de senha. Em **URL Configuration**, use a URL final da Vercel como **Site URL** e cadastre `https://SEU-WEB/nova-senha` como Redirect URL; mantenha também `http://localhost:3002/nova-senha` para desenvolvimento.

Rode `pnpm db:deploy` com a `DATABASE_URL` do Supabase e crie o bucket **privado** `essay-images`. Não habilite acesso público ao bucket: a API verifica essa configuração antes de gravar imagens e nunca entrega URL pública permanente.

## Checklist de liberação

- [ ] O workflow **CI / Qualidade e build** foi concluído com sucesso no commit de produção.
- [ ] `GET https://SUA-API.onrender.com/health` retorna sucesso.
- [ ] `WEB_ORIGIN`, CORS, Content-Security-Policy e Redirect URLs apontam somente para URLs HTTPS esperadas.
- [ ] Criação de conta, login, logout, refresh de sessão e recuperação de senha funcionam no domínio final.
- [ ] A instalação da PWA funciona em Android e iPhone e nenhuma redação, imagem ou token aparece no Cache Storage.
