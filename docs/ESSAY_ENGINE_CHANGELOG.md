# Changelog do motor de redação

## 2026-10-30 — Motor pedagógico v3

### Mudanças

- Modularização do domínio, contrato intercambiável de provedor e rubrica versionada.
- Pré-análise determinística, confiança, limitações, revisão humana e proteção contra prompt injection.
- Contrato Zod e persistência ampliados; migration de referências autorizadas e revisão humana.
- Interface de devolutiva com aviso de estimativa educacional, ações, limitações e intervenção decomposta.
- Template e validador de referências sem importação automática de conteúdo protegido.
- Identidade demonstrativa bloqueada em produção; JWT Supabase HS256 validado antes dos fluxos de quiz e redação.

### Testes

- Baseline: 27 testes aprovados.
- Após a alteração: schemas, validação de soma/citação, pré-análise, injeção, baixa confiança, fluxo e template de referências aprovados.

### Pendências

- Aplicar migration em banco configurado; ativar autenticação real e controle administrativo antes de expor revisão humana.
- Coletar dados autorizados e avaliações humanas para medir calibração; não há alegação de sistema calibrado.

### Correção operacional — Prisma local

- Regenerado o cliente Prisma com o engine local. Isso corrige o erro `P6001` que ocorria quando um cliente gerado sem engine tentava tratar uma `DATABASE_URL` PostgreSQL como URL do Prisma Accelerate.
- O ambiente de desenvolvimento foi reiniciado e a rota `GET /health` respondeu `200` em modo configurado.
- `pnpm dev` agora evita uma segunda inicialização quando API e web já estão em execução, impedindo colisões recorrentes nas portas 3001 e 3002.
- A própria API também trata `EADDRINUSE` ao subir: ao detectar outra instância na porta configurada, fecha a tentativa duplicada sem imprimir stack trace.

### Próximo passo

Calibrar o motor usando redações anonimizadas avaliadas por professores, de várias faixas de desempenho, com consentimento e revisão de qualidade.
