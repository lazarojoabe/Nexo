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

As sessões agora são associadas ao usuário informado pelo cabeçalho temporário `x-user-id` (ou `demo-user` no modo atual). A API impede que outro usuário responda ou consulte o resultado de uma sessão. A troca desse cabeçalho por Supabase Auth é uma etapa de configuração posterior, não uma mudança no domínio do quiz.

Questões anuladas ficam fora das consultas do quiz. A explicação exibida após a resposta vem do registro importado, nunca de uma resposta gerada pelo modelo de IA.
