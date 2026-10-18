// Materials screen (materials-ui.js).
export default {
  // Page ranges ("PDF página 3", "Páginas 3–5", lowercase "página 3" inside a sentence)
  'materials.range.pdfPage': 'PDF página {page}',
  'materials.range.pdfPages': 'PDF páginas {start}–{end}',
  'materials.range.page': 'Página {page}',
  'materials.range.pages': 'Páginas {start}–{end}',
  'materials.range.pageLower': 'página {page}',
  'materials.range.pagesLower': 'páginas {start}–{end}',

  // What kind of page a trecho is, when it is not study content
  'materials.kind.frontMatter': 'Página de abertura',
  'materials.kind.copyright': 'Direitos autorais',
  'materials.kind.dedication': 'Dedicatória',
  'materials.kind.preface': 'Prefácio',
  'materials.kind.acknowledgments': 'Agradecimentos',
  'materials.kind.summary': 'Resumo do próprio livro',
  'materials.kind.exercise': 'Exercícios do próprio livro',
  'materials.kind.answerKey': 'Gabarito do próprio livro',
  'materials.kind.reference': 'Referências',
  'materials.kind.appendix': 'Apêndice',
  'materials.kind.other': 'Outro',
  'materials.kind.notStudy': 'Não é conteúdo de estudo',
  'materials.kind.noDraft': '{label} — não gera rascunho.',

  // Generation progress panel
  'materials.progress.title': 'Gerando rascunho com IA — {title}',
  'materials.progress.note': 'A geração pode levar alguns minutos. Você pode sair desta tela: ela continua no servidor e o rascunho aparece na lista quando ficar pronto.',
  'materials.progress.background': 'Continuar em segundo plano',
  'materials.progress.cancel': 'Cancelar geração',
  'materials.progress.cancelling': 'Cancelando a geração…',
  'materials.progress.stalled': 'O serviço de IA está em silêncio há algum tempo. Isso nem sempre é problema: o modelo pode estar pensando. A geração continua; você pode esperar ou cancelar.',
  'materials.progress.cancelConfirm': 'Cancelar esta geração? Nada será salvo e o trecho fica livre para gerar de novo.',
  'materials.progress.cancelFailed': 'Não foi possível cancelar a geração.',

  // Generation outcomes
  'materials.generation.finished': 'Rascunho pronto: {title}. Abra-o na lista para revisar antes de aceitar.',
  'materials.generation.draftReady': 'Rascunho gerado. Revise antes de aceitar.',
  'materials.generation.cancelled': 'A geração foi cancelada. O trecho está livre para gerar de novo.',
  'materials.generation.inBackground': 'A geração continua em segundo plano. Quando ficar pronta, o trecho mostra Pronto na lista.',
  'materials.generation.startFailed': 'Não foi possível gerar o rascunho.',

  // Drafts
  'materials.draft.openFailed': 'Não foi possível abrir o rascunho.',
  'materials.draft.fallbackTitle': 'Rascunho',
  'materials.draft.showProgressLabel': 'Ver andamento da geração: {title}, {range}',
  'materials.draft.retryLabel': 'Tentar gerar de novo: {title}, {range}',
  'materials.draft.openLabel': 'Abrir rascunho: {title}, {range}',

  // Buttons and hints on a trecho
  'materials.action.showProgress': 'Ver andamento',
  'materials.action.retry': 'Tentar de novo',
  'materials.action.openDraft': 'Abrir rascunho',
  'materials.action.generate': 'Gerar rascunho com IA',
  'materials.proposal.fallbackTitle': 'Trecho',
  'materials.proposal.titleLabel': 'Título do trecho, {range}',
  'materials.proposal.saveTitle': 'Salvar título',
  'materials.proposal.titleSaved': 'Título salvo',
  'materials.proposal.saveFailed': 'Não foi possível salvar o título.',
  'materials.proposal.showExcerpt': 'Ver trecho da fonte',
  'materials.proposal.hideExcerpt': 'Ocultar trecho da fonte',
  'materials.proposal.lessonCreated': 'Aula já criada a partir deste trecho.',
  'materials.proposal.stalledHint': 'Sem sinal do serviço de IA há algum tempo. Isso nem sempre é problema; a geração continua.',

  // Document index
  'materials.index.summary.one': 'Índice do documento ({count} unidade)',
  'materials.index.summary.other': 'Índice do documento ({count} unidades)',
  'materials.editorial.summary': 'Páginas editoriais ({count}) — não geram conteúdo',

  // Topic search
  'materials.topic.rangeChars': '{range} · {chars} caracteres',
  'materials.topic.tooShort': 'Digite ao menos duas letras do assunto.',
  'materials.topic.searching': 'Procurando no documento…',
  'materials.topic.searchFailed': 'Não foi possível buscar o assunto.',
  'materials.topic.none': 'Nenhuma seção com esse assunto no índice do PDF. Tente outras palavras do título, ou use o índice do documento.',
  'materials.topic.found.one': '{count} seção encontrada. Confira as páginas antes de gerar.',
  'materials.topic.found.other': '{count} seções encontradas. Confira as páginas antes de gerar.',
  'materials.topic.approveFailed': 'Não foi possível aprovar este trecho.',

  // Documents already uploaded
  'materials.existing.pages': '{count} páginas',
  'materials.existing.open': 'Abrir',
  'materials.existing.openLabel': 'Abrir {name}',
  'materials.existing.opening': 'Abrindo o documento…',
  'materials.existing.openFailed': 'Não foi possível abrir o documento.',

  // Upload
  'materials.upload.sending': 'Enviando PDF…',
  'materials.upload.sendFailed': 'Não foi possível enviar o arquivo.',
  'materials.upload.extracting': 'Extraindo texto do PDF…',
  'materials.upload.extractFailed': 'Não foi possível extrair o texto do PDF.',
  'materials.upload.chunking': 'Gerando trechos propostos…',
  'materials.upload.chunkFailed': 'Não foi possível gerar propostas para este PDF.',
  'materials.upload.processFailed': 'Não foi possível processar o arquivo selecionado.',
  'materials.upload.proposed.one': '{count} trecho proposto. Diga o que você quer estudar, ou escolha no índice; revise os títulos antes de qualquer uso.',
  'materials.upload.proposed.other': '{count} trechos propostos. Diga o que você quer estudar, ou escolha no índice; revise os títulos antes de qualquer uso.',
  'materials.upload.proposedWithNote.one': '{count} trecho proposto. Diga o que você quer estudar, ou escolha no índice; revise os títulos antes de qualquer uso. {note}',
  'materials.upload.proposedWithNote.other': '{count} trechos propostos. Diga o que você quer estudar, ou escolha no índice; revise os títulos antes de qualquer uso. {note}',
};
