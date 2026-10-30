# Roadmap do motor de redação

## Baseline auditado — 2026-10-30

- [x] Repositório limpo antes da alteração; não havia mudanças locais a preservar.
- [x] Fluxo existente mapeado: imagem, pré-processamento, Gemini para transcrição e avaliação, confirmação do estudante, histórico e fallback em memória.
- [x] Baseline executado: 27 testes passaram.
- [x] Riscos identificados: regras acopladas ao Gemini, contrato sem confiança/rastreabilidade, ausência de análise determinística, persistência sem versões/revisões e cabeçalho demonstrativo sem autenticação real.

## Fases implementadas

- [x] Fase 1 — Módulos para rubrica, contrato de provedor, contexto, pré-análise, validação e métricas.
- [x] Fase 2 — Sinais objetivos, confiança, limitações, motivos de revisão e detecção de tentativa de injeção.
- [x] Fase 3 — Schema compartilhado com versão, provedor, modelo, confiança, revisão, limitações e sinais sem texto integral.
- [x] Fase 4 — Prompt de tutoria delimitado, temperatura/timeout configuráveis e saída JSON validada.
- [x] Fase 5 — Migration para metadados da avaliação, referências autorizadas e revisões humanas. Aplicação depende de banco configurado.
- [x] Fase 6 — Limites existentes preservados; adicionados deduplicação, limite diário e JWT HS256 obrigatório em produção. Produção continua bloqueada para imagens sem armazenamento privado.
- [x] Fase 7 — Resultado informa estimativa educacional, confiança, revisão humana, limitações e intervenção detalhada; histórico mantém comparação simples por competência.
- [x] Fase 8 — Schema, template e validador de referências autorizadas; sem scraping, download ou banco vetorial.
- [x] Fase 9 — Função de métricas de divergência por competência/total e modelo de revisão humana.
- [x] Fase 10 — Testes de schemas, citações, pré-análise, injeção, confiança e fluxo; lint, typecheck, test e build executados ao término.

## Arquivos de maior impacto

- `packages/shared/src/index.ts`
- `apps/api/src/essay-engine/*`, `apps/api/src/gemini.provider.ts`, `apps/api/src/services.ts`
- `apps/api/prisma/schema.prisma` e `apps/api/prisma/migrations/20261030000100_essay_engine_versions_and_calibration/migration.sql`
- `apps/web/components/evaluation-result.tsx` e `apps/web/lib/api.ts`

## Próxima etapa dependente de pessoas e dados

Constituir conjunto anonimizado, consentido e revisado por professores, com redações distribuídas entre faixas de desempenho. Só então medir divergência e decidir se a calibração por prompt/referências é suficiente antes de considerar qualquer treinamento futuro.
