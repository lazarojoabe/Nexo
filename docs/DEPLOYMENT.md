# Deploy sem custo

1. Crie projetos nos planos gratuitos compatíveis: Supabase Free, Vercel Hobby e um host gratuito para a API que aceite NestJS (confirme os termos vigentes antes de publicar).
2. No Supabase, em **Authentication > Providers**, deixe **Email** ativo, habilite **Confirm email** e marque **Disable signups**. Isso é obrigatório: a API cria, via service-role, somente os e-mails da allowlist e então pede ao Supabase o e-mail de confirmação. Configure o SMTP recomendado para produção. Em **URL Configuration**, cadastre `https://SEU-WEB/entrar?confirmado=1` e `https://SEU-WEB/nova-senha` como Redirect URLs; inclua também `http://localhost:3002/entrar?confirmado=1` e `http://localhost:3002/nova-senha` para desenvolvimento.
3. Aplique `pnpm db:deploy` com a `DATABASE_URL` do Supabase e crie o bucket **privado** `essay-images`. Não habilite acesso público ao bucket: a API verifica essa configuração antes de gravar imagens e nunca entrega URL pública permanente.
4. Na API, configure `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_JWT_AUDIENCE`, `SUPABASE_JWT_ISSUER`, `SUPABASE_ESSAY_BUCKET`, `GEMINI_API_KEY`, `WEB_ORIGIN`, `ALLOWED_SIGNUP_EMAILS` e `AI_EVALUATIONS_PER_DAY`. `WEB_ORIGIN` deve ser a URL HTTPS exata da web em produção; a API não libera localhost nesse ambiente. `ALLOWED_SIGNUP_EMAILS` é uma lista separada por vírgula; vazia bloqueia novos cadastros.
5. Na web, configure apenas `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Nunca publique `SUPABASE_JWT_SECRET`, service-role, `DATABASE_URL` ou `GEMINI_API_KEY` como variável `NEXT_PUBLIC_`.
6. Publique web e API, confira `/health`, o login, confirmação de e-mail, recuperação de senha e uma chamada autenticada. Clientes enviam o access token Supabase em `Authorization: Bearer`; a API valida assinatura HS256, expiração, audiência, role e issuer quando configurado.

## Checklist de produção e celular

- [ ] `DEMO_AUTH_ENABLED` não está definido como `true`; `x-user-id` é recusado em produção.
- [ ] Bucket `essay-images` está privado e as credenciais service-role estão apenas no host da API.
- [ ] `WEB_ORIGIN`, CORS, CSP e as Redirect URLs correspondem às URLs HTTPS reais.
- [ ] A allowlist contém apenas os e-mails convidados; altere-a e faça redeploy para adicionar/remover alguém.
- [ ] Teste login, logout, expiração/refresh da sessão e recuperação de senha em 320, 360, 390 e 430 px.
- [ ] Teste câmera, galeria, teclado virtual, áreas de toque, navegação inferior e envio de uma redação em Android e iPhone.
- [ ] Confirme que nenhuma redação, foto, avaliação ou token aparece no Cache Storage da PWA.

Não há deploy concluído nesta entrega: faltam credenciais e URLs do proprietário. Teste instalação no Android pelo menu do navegador e no iPhone por Compartilhar > Adicionar à Tela de Início. A PWA não armazena redações/imagens em cache público.
