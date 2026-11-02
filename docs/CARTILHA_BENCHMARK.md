# Benchmark local — Cartilha Redação a Mil 2.0

A cartilha de 2019 pode servir como uma regressão valiosa: ela reúne 44 redações de nota máxima sobre o tema "Democratização do acesso ao cinema no Brasil", com página de espelho e página de transcrição para cada autor. Este projeto a utiliza como **benchmark local**, e não como fine-tuning: 44 textos da mesma faixa e do mesmo tema não representam a distribuição necessária para treinar ou declarar calibrado um corretor.

O fluxo mede duas coisas que devem permanecer estáveis em cada atualização do agente:

1. páginas de transcrição digitada, nítidas e completas não devem receber confiança baixa apenas por não serem manuscritas;
2. o fluxo completo deve aceitar o JSON do provedor e comparar a nota estimada com a referência de 1000 pontos.

As imagens renderizadas, a transcrição e o relatório ficam em `tmp/` ou `data/essay-benchmarks/`, ambos fora do Git. Não copie o PDF, as páginas ou os textos das redações para o repositório. Antes de preparar o conjunto, registre a licença/autorização aplicável ao uso local.

## Preparar o conjunto local

O script usa `pypdf` e `pypdfium2`. No runtime de dependências do Codex essas bibliotecas já estão disponíveis; em outro Python, instale-as antes de executar.

```powershell
python scripts/prepare-cartilha-benchmark.py `
  --pdf "C:\Users\lazar\Downloads\Cartilha Redação a Mil 2.0 - Lucas Felpi.pdf" `
  --output tmp/cartilha-2019 `
  --license "<registro da licença ou autorização>" `
  --authorization-confirmed
```

O preparador exige exatamente 44 páginas identificadas como espelho e renderiza somente a página seguinte, que contém a transcrição. Ele cria `tmp/cartilha-2019/manifest.json` com hash do PDF, página de origem, hash da imagem e a referência esperada de 1000 pontos (cinco competências de 200).

## Executar a regressão

Configure `GEMINI_API_KEY` em `apps/api/.env`. A execução padrão usa um caso para validar a configuração e controlar custo; `--all` processa os 44 casos e faz três chamadas ao provedor por caso (leitura, verificação e avaliação, com uma quarta chamada apenas se a resposta precisar de reparo de formato).

```powershell
pnpm essays:benchmark -- --manifest tmp/cartilha-2019/manifest.json
pnpm essays:benchmark -- --manifest tmp/cartilha-2019/manifest.json --all
```

O relatório local não guarda a redação transcrita. Ele registra confiança da transcrição, necessidade de revisão, aceitação da avaliação, notas por competência, diferença para 1000 e métricas agregadas. Em indisponibilidade sistêmica do Gemini (por exemplo, cota esgotada), ele interrompe no primeiro caso e informa quantos itens não foram processados; isso não é uma falha pedagógica. Use uma piora de confiança, falha de validação ou aumento consistente da diferença de nota como regressão a investigar antes de publicar uma alteração do agente.

Para calibração real, complemente este benchmark com redações autorizadas e avaliadas por especialistas em múltiplas faixas de nota, temas e perfis de escrita. A cartilha de nota máxima é uma guarda contra subavaliação de textos excelentes; ela não deve empurrar automaticamente toda redação para cima.
