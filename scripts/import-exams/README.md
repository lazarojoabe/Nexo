# Importação de provas

O importador aceita JSON revisado manualmente, valida a estrutura e pode persistir de forma idempotente. Não publique uma prova extraída de PDF sem comparar cada questão, alternativa e gabarito com o material oficial correspondente (ano, dia, cor, idioma e versão).

Formato mínimo: `{ "sourceUrl": "https://...", "sourceVersion": "Inep 2024 — gabarito definitivo", "exam": { "year": 2024, "day": 1, "color": "azul", "version": "caderno-1" }, "questions": [{ "number": 1, "area": "Linguagens", "statement": "...", "options": [{"label":"A","content":"..."},{"label":"B","content":"..."},{"label":"C","content":"..."},{"label":"D","content":"..."},{"label":"E","content":"..."}], "correctOptionLabel": "C" }] }`. Registros anulados devem informar `isCancelled: true`.

Valide sem gravar: `pnpm import:exams caminho/da-prova.json`.

Grave no Supabase somente após a revisão: `pnpm import:exams caminho/da-prova.json --persist`.

Para baixar um PDF oficial antes da revisão: `pnpm exams:fetch --url https://download.inep.gov.br/...pdf --out data/exams/2025/dia-1-gabarito.pdf`. O downloader aceita somente HTTPS em `gov.br`/`inep.gov.br`, valida a assinatura PDF, limita o arquivo a 50 MB e imprime o hash SHA-256 para auditoria.
