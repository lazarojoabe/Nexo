# Reconhecimento e correção de redação

## Fluxo e consentimento

1. A pessoa envia até cinco imagens JPEG, PNG ou WebP de até 8 MB.
2. A API preserva a página original e produz uma cópia aprimorada com `sharp`.
3. Após consentimento explícito, cópias aprimoradas são enviadas ao provedor para transcrição.
4. O estudante revisa, corrige e confirma o texto. A confirmação é obrigatória antes da avaliação.
5. Após novo consentimento, somente o texto confirmado e o tema seguem ao provedor para uma devolutiva educacional.

Antes de marcar o consentimento, a interface deve explicar a finalidade (transcrever/avaliar), o provedor envolvido e que a estimativa não é nota oficial. Nunca envie imagem ou texto a um provedor sem essa ação afirmativa.

## Reconhecimento

O pré-processamento prioriza preservação: rotação, escala de cinza, contraste e nitidez. Segmentação agressiva por linhas ou palavras não é aplicada automaticamente porque pode apagar acentos e pontuação. A leitura aceita páginas manuscritas, digitadas, impressas e capturas de tela; a confiança mede legibilidade e completude, nunca o tipo de suporte. Se a leitura for incerta, a transcrição usa `[trecho ilegível]`; isso reduz a confiança da avaliação e pode recomendar revisão humana, sem penalização automática.

### Transcrição fiel, normalização visual e revisão

A transcrição manuscrita possui duas versões persistidas:

- `rawText` é a leitura fiel da página, preservando linhas físicas, hífens no final da linha e a estrutura visual detectada.
- `normalizedText` é a versão de leitura usada na revisão. Ela pode unir somente uma palavra claramente partida pela mudança física de linha, por exemplo `obs-\ntáculos` → `obstáculos`. Ela não corrige ortografia, gramática, concordância, pontuação, repertório ou escolha lexical do estudante.

O contrato também contém `paragraphs` (com intervalo de linhas), `corrections`, `uncertainTerms`, confiança total e a marcação `requiresReview`. As correções ficam visíveis: uma alteração automática por quebra de linha não é uma correção da escrita do estudante.

O provedor realiza duas leituras de imagem. A primeira transcreve fielmente e identifica blocos visuais por recuo, espaçamento e margens; a segunda só aponta divergências. Uma palavra semanticamente relevante só muda automaticamente quando a segunda leitura tiver evidência visual explícita e confiança muito alta (≥ 98,5%). Em qualquer outro caso, o termo fica destacado para confirmação humana. A interface permite editar o texto e unir ou separar parágrafos antes da avaliação.

O texto confirmado, mais a lista de parágrafos confirmados, segue para a avaliação ENEM. Isso conserva a organização produzida pelo estudante sem forçar uma quantidade de parágrafos.

## Avaliação pedagógica ENEM

O motor usa a rubrica `enem-2026-simulation-v3` e as cinco competências nas faixas 0, 40, 80, 120, 160 ou 200. A nota total é sempre a soma das cinco competências e é exibida como **estimativa educacional por IA — não é nota oficial do Inep**.

Cada trecho citado é verificado no texto confirmado, aceitando apenas normalização Unicode e espaços. Respostas JSON truncadas, inválidas, com competências ausentes/duplicadas, nota fora da escala, total divergente ou citação inventada são descartadas. A resposta exibida contém ações de revisão, não uma redação pronta ou parágrafos para copiar.

O texto da redação é dado não confiável. Instruções inseridas nele são ignoradas como comandos e analisadas apenas como conteúdo. O produto não penaliza posição política, religiosa, filosófica ou ideológica por si só.

## Privacidade, retenção e exclusão

- A API não registra redações completas, prompts completos ou respostas completas em logs.
- Em produção, imagens devem usar bucket privado e acesso autenticado. Não usar o fallback local/memória como armazenamento de produção.
- O proprietário deve definir prazo de retenção, mecanismo de exclusão e canal para pedidos do titular antes do uso público. A exclusão deve abranger imagens originais/processadas, texto, avaliação e revisões relacionadas.
- Para desenvolvimento sem banco, os dados existem somente no processo e o modo é demonstrativo; não é garantia de retenção nem de privacidade de produção.
- Em produção, use JWT Supabase válido no cabeçalho `Authorization`; a API valida tokens ES256 pela JWKS pública do Supabase e mantém suporte a HS256 legado com `SUPABASE_JWT_SECRET`. A API rejeita `x-user-id` nesse ambiente.

## Configuração do provedor

`GEMINI_API_KEY` habilita o provedor atual. `GEMINI_MODEL`, `GEMINI_TEMPERATURE` (máximo 0,2; padrão 0,1 para leitura mais reprodutível), `AI_PROVIDER_TIMEOUT_MS`, `AI_EVALUATIONS_PER_DAY` e `ESSAY_RUBRIC_VERSION` são configuráveis por ambiente. O timeout é limitado entre 5 e 120 segundos. Falhas preservam o trabalho do estudante e retornam uma mensagem segura.

## Referências autorizadas e RAG futuro

Não há download ou scraping de redações, apostilas ou materiais protegidos. Para validar um lote de referências cujo uso esteja autorizado:

```bash
pnpm --filter @nexo/api references:validate docs/ESSAY_REFERENCE_IMPORT_TEMPLATE.json
```

Cada item exige tema, origem, licença, confirmação de autorização, status, anotações, tags e trecho autorizado. A validação não importa nem publica conteúdo. Quando houver fluxo administrativo autenticado, o lote validado poderá ser revisado e inserido em `EssayReference`.

Evolução planejada:

1. referências curadas e busca simples por tema/tags;
2. avaliar qualidade e volume antes de introduzir `pgvector`/RAG;
3. usar referências para contextualizar feedback, nunca para copiar resposta pronta;
4. registrar versão e origem de qualquer referência utilizada.

## Calibração humana

`HumanEssayReview` e `calculateCalibrationMetrics` preparam a comparação de notas da IA e professor: diferença absoluta por competência, diferença total, distribuição e taxa de baixa confiança/revisão. O sistema não é declarado calibrado sem uma base humana revisada.

Redações nota 1000 isoladas não bastam para treinar um corretor. Antes de qualquer fine-tuning — que não faz parte deste projeto — são necessários dados anonimizados e consentidos de várias faixas, tema, notas por competência, justificativas de corretores, controle de qualidade, base legal, divisão treino/validação/teste e avaliação cega por especialistas. Uma coleção autorizada de redações nota máxima pode, porém, ser usada como benchmark local de regressão para detectar subavaliação e falhas de OCR; consulte [CARTILHA_BENCHMARK.md](CARTILHA_BENCHMARK.md).

Referências oficiais: [Cartilha do Enem 2026](https://www.gov.br/inep/pt-br/centrais-de-conteudo/noticias/enem/enem-2026-cartilha-da-redacao-esta-disponivel) e [documentos e manuais do Enem](https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem/outros-documentos).
