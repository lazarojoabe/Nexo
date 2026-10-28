# Deploy sem custo

1. Crie projetos nos planos gratuitos compatíveis: Supabase Free, Vercel Hobby e um host gratuito para a API que aceite NestJS (confirme os termos vigentes antes de publicar).
2. Aplique `pnpm db:migrate` com a `DATABASE_URL` do Supabase e configure um bucket **privado** `essay-images`.
3. Configure na API `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `GEMINI_API_KEY`, `WEB_ORIGIN` e `AI_EVALUATIONS_PER_DAY`.
4. Na web, configure `NEXT_PUBLIC_API_URL` para a URL HTTPS pública da API.
5. Publique a web e a API, atualize CORS (`WEB_ORIGIN`) e confira `/health` e `/api/docs` pelas URLs reais.

Não há deploy concluído nesta entrega: faltam credenciais e URLs do proprietário. Teste instalação no Android pelo menu do navegador e no iPhone por Compartilhar > Adicionar à Tela de Início. A PWA não armazena redações/imagens em cache público.
