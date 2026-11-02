# Deploy sem custo

Para a sequência recomendada com CI no GitHub, Vercel e Render, veja [Publicação em produção](./PRODUCTION_DEPLOY.md).

1. Crie projetos nos planos gratuitos compatíveis: Supabase Free, Vercel Hobby e um host gratuito para a API que aceite NestJS (confirme os termos vigentes antes de publicar).
2. No Supabase, em **Authentication > Providers**, deixe **Email** ativo, desabilite temporariamente **Confirm email** e marque **Disable signups**. A API cria contas pelo service-role já confirmadas, sem disparar e-mail de ativação. Configure SMTP para a recuperação de senha. Em **URL Configuration**, cadastre `https://SEU-WEB/nova-senha` como Redirect URL; inclua também `http://localhost:3002/nova-senha` para desenvolvimento.
3. Aplique `pnpm db:deploy` com a `DATABASE_URL` do Supabase e crie o bucket **privado** `essay-images`. Não habilite acesso público ao bucket: a API verifica essa configuração antes de gravar imagens e nunca entrega URL pública permanente.
4. Na API, configure `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_AUDIENCE`, `SUPABASE_JWT_ISSUER`, `SUPABASE_ESSAY_BUCKET`, `GEMINI_API_KEY`, `WEB_ORIGIN` e `AI_EVALUATIONS_PER_DAY`. `SUPABASE_JWT_SECRET` é opcional e só é necessário para projetos legados que ainda emitem JWT HS256; projetos atuais ES256 são validados pela JWKS pública do `SUPABASE_URL`. `WEB_ORIGIN` deve ser a URL HTTPS exata da web em produção; a API não libera localhost nesse ambiente.
5. Na web, configure apenas `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Nunca publique `SUPABASE_JWT_SECRET`, service-role, `DATABASE_URL` ou `GEMINI_API_KEY` como variável `NEXT_PUBLIC_`.
6. Publique web e API, confira `/health`, criação de conta, login, recuperação de senha e uma chamada autenticada. Clientes enviam o access token Supabase em `Authorization: Bearer`; a API valida assinatura ES256 pela JWKS pública (ou HS256 legado), expiração, audiência, role e issuer quando configurado.

## Checklist de produção e celular

- [ ] `DEMO_AUTH_ENABLED` não está definido como `true`; `x-user-id` é recusado em produção.
- [ ] Bucket `essay-images` está privado, `GEMINI_MODEL=gemini-2.5-flash` está configurado e as credenciais service-role estão apenas no host da API.
- [ ] `WEB_ORIGIN`, CORS, CSP e as Redirect URLs correspondem às URLs HTTPS reais.
- [ ] A confirmação de e-mail está desativada temporariamente no Supabase e o limite de cadastros por IP foi revisado.
- [ ] Teste login, logout, expiração/refresh da sessão e recuperação de senha em 320, 360, 390 e 430 px.
- [ ] Teste câmera, galeria, teclado virtual, áreas de toque, navegação inferior e envio de uma redação em Android e iPhone.
- [ ] Confirme que nenhuma redação, foto, avaliação ou token aparece no Cache Storage da PWA.

Não há deploy concluído nesta entrega: faltam credenciais e URLs do proprietário. Teste instalação no Android pelo menu do navegador e no iPhone por Compartilhar > Adicionar à Tela de Início. A PWA não armazena redações/imagens em cache público.
