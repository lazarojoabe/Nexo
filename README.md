# Nexo ENEM AI

MVP mobile-first para treino de quiz e redação do ENEM. O quiz aceita provas importadas em PostgreSQL/Supabase, organiza a escolha por ano, conteúdo e idioma e monta sessões completas por bloco (por exemplo, 45 questões). As respostas são validadas pelo gabarito persistido. Sem banco configurado, a API continua disponível em **modo demonstrativo** com uma questão fictícia explicitamente identificada.

## Rodar localmente

```bash
pnpm install
cp .env.example apps/api/.env
# Crie também apps/web/.env.local com NEXT_PUBLIC_API_URL,
# NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.
pnpm dev
```

Abra `http://localhost:3002`. A API NestJS fica em `http://localhost:3001` e a documentação REST em `http://localhost:3001/api/docs`.

`pnpm dev` detecta uma instância já ativa nas duas portas e encerra sem erro. Caso apenas uma das portas esteja ocupada, ele informa a situação em vez de iniciar processos duplicados.

Para checagem: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

Depois de configurar uma `DATABASE_URL` válida do Supabase, gere o cliente com `pnpm db:generate` e aplique as migrations versionadas com `pnpm db:deploy`. Use `pnpm db:migrate` apenas para criar novas migrations durante desenvolvimento. A migration `20261030000100_essay_engine_versions_and_calibration` adiciona metadados do motor, referências autorizadas e revisões humanas.

## Configuração

Consulte [.env.example](.env.example), [arquitetura](docs/ARCHITECTURE.md), [motor de redação](docs/AI_ESSAY_RECOGNITION.md) e [deploy](docs/DEPLOYMENT.md). Somente `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` podem ficar no cliente. `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` e `GEMINI_API_KEY` pertencem exclusivamente à API. Para produção, configure Supabase Auth/Storage privado, PostgreSQL e Gemini em seus planos gratuitos elegíveis.

O cadastro é feito pelo Supabase Auth com e-mail e senha e recuperação de senha. Nesta fase, novas contas são marcadas como confirmadas pela API, sem enviar e-mail de ativação, e entram automaticamente após o cadastro. A API permite novos cadastros, com limite de requisições por IP e sem expor se um endereço já possui conta. Não há senhas no Prisma.

Para o motor de redação, configure `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TEMPERATURE`, `AI_PROVIDER_TIMEOUT_MS`, `AI_EVALUATIONS_PER_DAY` e `ESSAY_RUBRIC_VERSION`. A temperatura é limitada a 0,3 para reduzir variação. Referências pedagógicas só podem ser validadas quando houver origem/licença/autorização registradas:

```bash
pnpm --filter @nexo/api references:validate docs/ESSAY_REFERENCE_IMPORT_TEMPLATE.json
```

## Limitações importantes

- As provas importadas são armazenadas no banco e devem ser tratadas como material de treino; confira sempre a fonte e o edital oficial antes de publicar conteúdo.
- Transcrição e avaliação exigem Gemini configurado, consentimento informado e a disponibilidade de cota gratuita. O app não inventa resultados quando o serviço está indisponível.
- Em produção, a API exige `Authorization: Bearer <JWT>` assinado pelas chaves públicas JWKS do Supabase (ES256), ou pelo segredo `SUPABASE_JWT_SECRET` em projetos legados HS256; `x-user-id` não é aceito. O modo demonstrativo requer `DEMO_AUTH_ENABLED=true` e só é permitido em desenvolvimento/teste.
- A devolutiva é uma estimativa educacional por IA, não uma nota oficial do Inep. Ela pode sinalizar baixa confiança e necessidade de revisão humana.
- Não há calibração declarada: a próxima etapa é comparar avaliações com redações anonimizadas, consentidas e corrigidas por professores em várias faixas.
