# Reconhecimento e correção de redação

## O que foi reaproveitado do trabalho de PDI

O projeto externo `pdi_trabalho_novo` foi usado como referência de engenharia, sem copiar o repositório pessoal para o produto. A etapa de imagem aproveita as ideias mais seguras do pipeline:

- rotação e normalização da página;
- conversão para escala de cinza;
- redução de ruído e realce de traços;
- preservação da ordem das páginas;
- uso de baixa confiança para revisão humana.

A segmentação agressiva por linhas, palavras, componentes conexos e remoção de linhas de caderno não é aplicada automaticamente nesta primeira versão. Ela pode apagar acentos, sinais de pontuação e trechos claros. Por isso, o modelo multimodal recebe uma imagem aprimorada, mas a pessoa mantém a última palavra sobre o texto transcrito.

## Fluxo atual

1. A pessoa envia até cinco imagens JPEG, PNG ou WebP de até 8 MB.
2. A API preserva o original e gera uma cópia aprimorada com `sharp`.
3. Após consentimento, as cópias aprimoradas são enviadas ao Gemini para transcrição.
4. A resposta é validada por schema: texto de até 8.000 caracteres e trechos com baixa confiança.
5. O estudante revisa e salva a transcrição antes de pedir avaliação.

O reconhecimento não corrige o texto automaticamente. Quando a imagem não permite leitura, o prompt instrui a IA a usar `[ilegível]`, evitando invenções silenciosas.

## Correção no modelo ENEM

A avaliação usa a versão de prompt `enem-2026-simulation-v1`, com as cinco competências, faixas de 0 a 200 em incrementos de 40, justificativa baseada em evidências e próximos passos para chegar a 200. A resposta estruturada é validada antes de ser exibida.

Isso é uma camada de tutoria e não um treinamento/fine-tuning do modelo. O produto deve continuar exibindo que a nota é uma estimativa educacional, não uma nota oficial do Inep.

Referências oficiais: [Cartilha do Enem 2026](https://www.gov.br/inep/pt-br/centrais-de-conteudo/noticias/enem/enem-2026-cartilha-da-redacao-esta-disponivel) e [documentos e manuais do Enem](https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem/outros-documentos).

## Próxima evolução recomendada

- migrar as imagens originais e aprimoradas da memória para um bucket privado do Supabase Storage;
- guardar versão da transcrição, confiança e revisão do estudante no banco;
- adicionar um modo opcional para folha pautada, com remoção de linhas apenas quando a detecção tiver alta confiança;
- comparar avaliações ao longo do tempo por competência, sem transformar a nota em diagnóstico definitivo.
