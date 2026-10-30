# Importação de provas

O importador aceita JSON revisado manualmente, valida a estrutura e pode persistir de forma idempotente. Não publique uma prova extraída de PDF sem comparar cada questão, alternativa e gabarito com o material oficial correspondente (ano, dia, cor, idioma e versão).

Formato mínimo: `{ "sourceUrl": "https://...", "sourceVersion": "Inep 2024 — gabarito definitivo", "exam": { "year": 2024, "day": 1, "color": "azul", "version": "caderno-1" }, "questions": [{ "number": 1, "area": "Linguagens", "statement": "...", "options": [{"label":"A","content":"..."},{"label":"B","content":"..."},{"label":"C","content":"..."},{"label":"D","content":"..."},{"label":"E","content":"..."}], "correctOptionLabel": "C" }] }`. Registros anulados devem informar `isCancelled: true`.

Valide sem gravar: `pnpm import:exams caminho/da-prova.json`.

Grave no Supabase somente após a revisão: `pnpm import:exams caminho/da-prova.json --persist`.

Para baixar um PDF oficial antes da revisão: `pnpm exams:fetch --url https://download.inep.gov.br/...pdf --out data/exams/2025/dia-1-gabarito.pdf`. O downloader aceita somente HTTPS em `gov.br`/`inep.gov.br`, valida a assinatura PDF, limita o arquivo a 50 MB e imprime o hash SHA-256 para auditoria.

## Download automático de provas e gabaritos

Para baixar, de uma só vez, os cadernos e os gabaritos da **aplicação regular** de um ano, use:

`pnpm exams:download --year 2025`

Antes de baixar, confira o que será encontrado com `pnpm exams:download --year 2025 --dry-run`. O script consulta somente a página anual oficial do Inep, aceita apenas PDFs em domínios `gov.br`/`inep.gov.br`, baixa os cadernos 1 a 8 e seus gabaritos, valida a assinatura de cada PDF, limita cada arquivo a 50 MB e cria `data/exams/<ano>/manifest.json` com URL final, tamanho e SHA-256. Use `--out <pasta>` para alterar o destino ou `--source <página-oficial>` se o Inep alterar a URL anual.

O download não importa questões no banco. Extraia e confira os arquivos localmente e só então execute o fluxo de importação revisada abaixo.

## Imagens de questões

Cada questão pode declarar até 12 ativos em `assets`. O ativo deve apontar para uma imagem já hospedada no armazenamento do projeto, preservar a origem no PDF e informar texto alternativo. As posições aceitas são `before_statement`, `after_statement` e `option` (neste último caso, `optionLabel` é obrigatório).

Exemplo:

```json
{
  "url": "https://cdn.exemplo.com/enem/2025/dia-1/q12-grafico.webp",
  "storagePath": "exam-assets/enem/2025/dia-1/q12-grafico.webp",
  "placement": "after_statement",
  "displayOrder": 0,
  "mimeType": "image/webp",
  "altText": "Gráfico de barras com a variação anual indicada no enunciado.",
  "sourcePage": 7,
  "sourceCrop": { "x": 82.4, "y": 216.1, "width": 245.5, "height": 168.2 },
  "sourceHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

O importador valida a posição, a alternativa vinculada, a ordem, o formato e o hash. Para gerar recortes revisáveis diretamente de um PDF, use:

`pnpm exams:assets --exam caminho/prova.pdf --payload tmp/pdfs/enem-2025-dia-1-azul-en.json --out-json tmp/pdfs/enem-2025-dia-1-azul-en-com-imagens.json --out-dir data/exam-assets/enem-2025-dia-1-en`

Os PNGs serão servidos localmente pela API em `http://localhost:3001/exam-assets/...` e aparecerão no quiz depois que o JSON enriquecido for importado. O script detecta imagens raster e sugere a questão mais próxima na mesma coluna; no caderno de 2025 ele também isola as páginas próprias de Inglês/Espanhol nas questões 1 a 5. Revise a associação, a descrição alternativa e a posição (`before_statement`, `after_statement` ou `option`) antes de executar `pnpm import:exams ... --persist`. Gráficos vetoriais e figuras que o PDF não expõe como imagem devem ser recortados e adicionados manualmente ao mesmo formato.

## PDF local e revisão

Os scripts de PDF usam Python 3.10+ e PyMuPDF. Instale uma vez no ambiente local com `python -m pip install -r scripts/import-exams/requirements.txt`.

O script `extract_local_pdf.py` gera rascunhos a partir do caderno e do gabarito
baixados usando PyMuPDF. Exemplo:

`python scripts/import-exams/extract_local_pdf.py --exam caminho/prova.pdf --key caminho/gabarito.pdf --out-dir tmp/pdfs`

Ele cria um JSON para inglês e outro para espanhol (as questões 1–5 mudam; as
demais são compartilhadas), verifica cinco alternativas por questão e não grava
no banco automaticamente. Compare os rascunhos com os PDFs antes de usar
`pnpm import:exams ... --persist`.
