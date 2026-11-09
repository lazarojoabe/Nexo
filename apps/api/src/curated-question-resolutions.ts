type CuratedQuestionResolution = {
  explanation: string;
  pdfUrl?: string;
};

const enem2025Day1BlueResolutions = new Map<number, CuratedQuestionResolution>([
  [21, {
    explanation: 'A alternativa C é a correta. A repetição de "o meu medo é" reúne receios sobre estudo, trabalho, desemprego e abordagem policial. Esses elementos não se limitam ao desempenho escolar ou à profissão: eles expressam a vulnerabilidade social do narrador e a incerteza sobre seu lugar na sociedade.',
    pdfUrl: '/resolucoes/enem-2025-dia-1-questoes-21-a-23.pdf',
  }],
  [22, {
    explanation: 'A alternativa B é a correta. Os artistas observam troncos e gravetos que, à primeira vista, parecem não ter uma função artística e passam a enxergar neles bancos, figuras e esculturas. A originalidade está justamente em ressignificar essa matéria-prima, atribuindo-lhe uma nova função como obra de arte.',
    pdfUrl: '/resolucoes/enem-2025-dia-1-questoes-21-a-23.pdf',
  }],
  [23, {
    explanation: 'A alternativa C é a correta. Em Azulejaria em carne viva, Adriana Varejão aproxima o azulejo ligado à herança portuguesa de cortes, fissuras e carne exposta. Esses recursos transformam visualmente as marcas e violências produzidas pelo processo colonial brasileiro; por isso, não tratam de conservação do patrimônio nem de incentivos à arte.',
    pdfUrl: '/resolucoes/enem-2025-dia-1-questoes-21-a-23.pdf',
  }],
]);

/** Resoluções pedagógicas revisadas para itens já publicados. */
export function curatedQuestionResolution(exam: { year: number; day: number; color: string }, questionNumber: number): CuratedQuestionResolution | undefined {
  if (exam.year !== 2025 || exam.day !== 1 || exam.color.trim().toLocaleLowerCase('pt-BR') !== 'azul') return undefined;
  return enem2025Day1BlueResolutions.get(questionNumber);
}
