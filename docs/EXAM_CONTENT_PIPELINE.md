# Arquitetura de provas, questões e gabaritos

## Princípio

O PDF oficial é fonte de conteúdo, não é o formato usado diretamente pelo quiz. Cada prova passa por uma etapa de revisão e vira um pacote versionado de dados:

```text
fonte oficial (prova + gabarito)
        ↓ revisão humana / normalização
JSON revisado (questões, alternativas, gabarito, origem)
        ↓ schema + checagem de duplicidade
Prisma/Supabase (Exam → Question → QuestionOption)
        ↓ consulta sem correctOptionId
quiz no celular → resposta → validação contra gabarito persistido
```

O Inep mantém uma página própria de [provas e gabaritos](https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem/provas-e-gabaritos), com edições, dias e cadernos por cor. O sistema registra `sourceUrl` e `sourceVersion` para permitir auditoria da origem.

## Contrato de importação

O arquivo revisado contém:

- identificação da prova: ano, dia, cor, idioma e versão;
- origem: URL oficial e versão do gabarito usado;
- questão: número, área, enunciado e imagem opcional;
- exatamente cinco alternativas rotuladas A–E;
- `correctOptionLabel`, ou `isCancelled: true` para anuladas.

O importador gera IDs determinísticos (`examId-qN` e `examId-qN-a`) e faz `upsert`. Assim, rodar o mesmo pacote novamente atualiza a prova sem duplicar questões. A chave única `(examId, number)` impede duas versões da mesma questão dentro de uma prova.

## Operação

### Importação administrativa de arquivos locais

O caminho de administração é diferente do importador JSON histórico e é a opção indicada para uma nova prova oficial recebida pela equipe:

```text
upload local (prova PDF + gabarito PDF/imagem)
        ↓ assinatura/tamanho/tipo real + SHA-256
prévia temporária (extração separada + exceções + diff)
        ↓ aprovação explícita do administrador
Exam/Question + ExamImportBatch/ExamImportSource + recortes auditáveis
```

Não há qualquer busca, scraping ou download automático nesse fluxo. O arquivo da prova fornece apenas questões, alternativas, área, páginas e recortes. O arquivo de gabarito fornece apenas número e letra correta. OCR é tratado como sugestão e uma leitura incompleta, duplicada ou de baixa confiança entra na fila de exceções.

As exceções bloqueantes são: número duplicado, alternativa A–E incompleta, conflito/ausência de gabarito, gabarito sem questão, metadado divergente e ativo visual sem vínculo. A prévia também marca leituras de baixa confiança para revisão. O contrato compartilhado volta a validar todas as questões ativas antes da aprovação.

O lote final retém hashes, páginas, origem `local-upload`, caminhos de origem e o relatório JSON. `Question.sourcePage` e `Question.sourceDocumentHash` conectam cada questão ao PDF. A chave da prova continua `(year, day, color, language, version)`; repetir o mesmo pacote não cria outra prova. Antes de atualizar uma questão existente — tratada como publicada quando já está disponível no quiz — o administrador deve conferir o diff e enviar confirmação explícita.

Consulte o [guia operacional](../scripts/import-exams/README.md#fluxo-administrativo-local-prova--gabarito) para variáveis, limites, rota da interface e comandos de desenvolvimento.

```text
pnpm import:exams caminho/prova-revisada.json
```

Valida e mostra o que será importado, sem alterar o banco. Depois da conferência:

```text
pnpm import:exams caminho/prova-revisada.json --persist
```

O `--persist` exige `DATABASE_URL` e grava no Supabase. A extração de PDFs continua deliberadamente separada: OCR ou parsing automático pode trocar a ordem das alternativas, perder imagens ou associar o gabarito errado.

## Execução do quiz

- `GET /exams` lista provas disponíveis e quantidade de questões ativas;
- `GET /questions?examId=...` lista enunciados e alternativas, sem revelar o gabarito;
- `POST /quiz-sessions` recebe `examId` e uma seleção de questões;
- quando apenas `examId` é enviado, a API monta uma sessão de até 10 questões ativas da prova;
- `POST /quiz-sessions/:id/answers?questionId=...` verifica que a questão pertence à sessão e compara a alternativa enviada com `Question.correctOptionId` persistida;
- `GET /quiz-sessions/:id/results` consolida acertos e tentativas.

As sessões são associadas ao sujeito do JWT Supabase validado. A identidade demonstrativa `demo-user` só é habilitada de forma explícita com `DEMO_AUTH_ENABLED=true` em desenvolvimento/teste; `x-user-id` não é aceito. A API impede que outro usuário responda ou consulte o resultado de uma sessão.

Questões anuladas ficam fora das consultas do quiz. A explicação exibida após a resposta vem do registro importado, nunca de uma resposta gerada pelo modelo de IA.
