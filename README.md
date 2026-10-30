# Nexo ENEM AI

MVP mobile-first para treino de quiz e redação do ENEM. O quiz aceita provas importadas em PostgreSQL/Supabase, organiza a escolha por ano, conteúdo e idioma e monta sessões completas por bloco (por exemplo, 45 questões). As respostas são validadas pelo gabarito persistido. Sem banco configurado, a API continua disponível em **modo demonstrativo** com uma questão fictícia explicitamente identificada.

## Rodar localmente

```bash
cp .env.example apps/api/.env
pnpm install
pnpm dev
```

Abra `http://localhost:3002`. A API NestJS fica em `http://localhost:3001` e a documentação REST em `http://localhost:3001/api/docs`.

Para checagem: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

Depois de configurar uma `DATABASE_URL` válida do Supabase, gere o cliente com `pnpm db:generate` e aplique a migration já versionada com `pnpm db:deploy`. Use `pnpm db:migrate` apenas para criar novas migrations durante desenvolvimento.

## Configuração

Consulte [.env.example](.env.example), [arquitetura](docs/ARCHITECTURE.md) e [deploy](docs/DEPLOYMENT.md). Nunca use chaves com prefixo `NEXT_PUBLIC_`. Para produção, configure Supabase Auth/Storage privado, PostgreSQL e Gemini em seus planos gratuitos elegíveis.

## Limitações importantes

- As provas importadas são armazenadas no banco e devem ser tratadas como material de treino; confira sempre a fonte e o edital oficial antes de publicar conteúdo.
- Transcrição e avaliação exigem Gemini configurado, consentimento informado e a disponibilidade de cota gratuita. O app não inventa resultados quando o serviço está indisponível.
- Antes de uso real multiusuário, substitua o cabeçalho demonstrativo `x-user-id` por validação de JWT do Supabase.
