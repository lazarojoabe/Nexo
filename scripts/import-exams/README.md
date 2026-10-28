# Importação de provas

O importador inicial aceita JSON revisado manualmente. Não publique uma prova extraída de PDF sem comparar cada questão, alternativa e gabarito com o material oficial correspondente (ano, dia, cor, idioma e versão).

Formato: `{ "sourceUrl": "...", "sourceVersion": "...", "exam": { "year": 2024, "day": 1, "color": "azul", "version": "..." }, "questions": [] }`. Registros anulados devem informar `isCancelled: true`; questões reprovadas na revisão não devem ser persistidas.
