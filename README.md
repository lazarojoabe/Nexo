# Nexo ENEM AI

MVP mobile-first para treino de quiz e redação do ENEM. A entrega inicia sem serviços externos em **modo demonstrativo**: o quiz contém apenas uma questão fictícia explicitamente identificada e a avaliação de IA informa que está indisponível até configurar credenciais.

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

- Não há provas ou gabaritos oficiais no repositório. O importador só valida JSON revisado; a persistência final requer a conexão Prisma/Supabase.
- Transcrição e avaliação exigem Gemini configurado, consentimento informado e a disponibilidade de cota gratuita. O app não inventa resultados quando o serviço está indisponível.
- Antes de uso real multiusuário, substitua o cabeçalho demonstrativo `x-user-id` por validação de JWT do Supabase e conecte os repositórios em memória ao Prisma.
