# Plano de implementação — Nexo ENEM AI

## Arquitetura

Monorepo pnpm com `apps/web` (Next.js/App Router, PWA e interface mobile), `apps/api` (NestJS REST/Swagger) e `packages/shared` (contratos Zod e regras determinísticas). PostgreSQL/Supabase é a persistência prevista. Sem variáveis de integração, a API inicia em modo demonstrativo com uma questão fictícia identificada.

## Fases

1. Fundação: workspace, tipagem estrita, documentação, contratos, API e web.
2. Quiz: listagem, sessão, correção determinística pelo gabarito, histórico e teste de fluxo.
3. Redação: upload validado, revisão da transcrição e adaptador Gemini com JSON validado.
4. PWA: manifesto, service worker, interface mobile-first e instruções de instalação.
5. Validação: lint, typecheck, testes e build de produção.

## Dependências e riscos

- Não há PDFs ou gabaritos Inep no repositório. Por isso não há conteúdo atribuído ao Inep. A importação aceita JSON revisado e pede origem/versão.
- A extração de PDF deve passar por revisão humana por ano, dia, cor, idioma e versão antes de persistir.
- Transcrição e avaliação requerem `GEMINI_API_KEY`, consentimento explícito e disponibilidade da cota gratuita. O app preserva o texto e nunca cria nota offline.
- Supabase Auth e Storage privado são requisitos antes do uso multiusuário em produção. O modo demonstrativo não é apropriado para dados sensíveis.

## Critérios de aceite

- Web e API iniciam; `/health` responde em modo demo.
- Uma resposta de quiz é corrigida contra o gabarito determinístico.
- O texto de redação é salvo antes da avaliação; envio à IA exige consentimento.
- A PWA possui manifesto e o cache só cobre recursos públicos locais.
- Testes cobrem correção, soma de nota, validação de resposta de IA e fluxo de quiz.
