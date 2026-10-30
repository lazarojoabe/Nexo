# Arquitetura

O navegador fala somente com a API NestJS. Chaves de provedores de IA e do Supabase ficam no servidor. O pacote `@nexo/shared` contém os schemas Zod que validam entradas e saídas estruturadas. Questões são corrigidas somente pelo `correctOptionId` persistido; IA jamais escolhe gabarito.

## Motor de redação

O fluxo preserva o processo existente: tema → imagens → pré-processamento → transcrição → confirmação explícita do texto → avaliação → histórico. A avaliação é uma **estimativa educacional**, jamais uma nota oficial do Inep.

Após a confirmação do estudante, `EssayService` coordena o motor:

1. `essay-engine/pre-analysis.ts` calcula somente sinais objetivos (tamanho, parágrafos, trechos ilegíveis, estrutura aparente, repetição, indícios de conclusão/intervenção e possível prompt injection).
2. `essay-engine/evaluation-context.ts` monta o contexto; o texto é serializado e delimitado como dado não confiável.
3. `EssayAiProvider` é a fronteira de fornecedor. `GeminiProvider` é a implementação atual, mas a regra pedagógica e a validação não ficam nele.
4. `essay-engine/evaluation-validation.ts` valida schema, cinco competências, faixas permitidas, soma, evidências literais, versão de rubrica, confiança, limitações e revisão humana.
5. A avaliação validada é persistida como payload junto de fornecedor, modelo, rubrica e sinais de confiança. Não há log do texto, prompt ou resposta completos.

Os sinais determinísticos não atribuem nota. Eles apenas tornam a incerteza explícita e podem baixar a confiança ou recomendar revisão humana.

## Dados e persistência

`EssayEvaluation` mantém o payload validado e metadados reprodutíveis. `EssayReference` armazena somente material cuja origem, licença e autorização foram registradas. `HumanEssayReview` associa uma avaliação de IA a notas humanas, divergência e estado de revisão. Não existem endpoints administrativos públicos para essas entidades enquanto a autenticação real não estiver instalada.

A migration `20261030000100_essay_engine_versions_and_calibration` acrescenta os campos de auditoria e as duas novas tabelas. Aplique-a somente com `DATABASE_URL` configurada usando `pnpm db:deploy`.

Sem banco, a API permanece em modo demonstrativo em memória. Esse modo é explicitamente não persistente, aplica limite por processo e não deve ser usado como produção.

## Segurança e privacidade

Em produção, a API valida JWT Supabase HS256 (`Authorization: Bearer`) com expiração, audiência e assinatura em tempo constante; o cabeçalho `x-user-id` só funciona fora de produção. Imagens devem ficar em bucket privado e dados só devem ser enviados ao provedor após consentimento específico. O serviço limita imagens, tamanho, chamadas simultâneas por redação, chamadas diárias por usuário e tempo de resposta do provedor.

Erros preservam a transcrição confirmada e nunca expõem detalhes internos. A política operacional de consentimento, retenção e exclusão está em [AI_ESSAY_RECOGNITION.md](AI_ESSAY_RECOGNITION.md).
