import { writeFileSync } from 'node:fs';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';

const pages = [
  'Farmacocinética descreve absorção, distribuição, metabolismo e excreção dos fármacos no organismo humano durante o tratamento clínico.',
  'Farmacodinâmica estuda o mecanismo de ação dos fármacos nos receptores celulares e a relação entre dose e resposta terapêutica observada.',
  'Interações medicamentosas ocorrem quando um fármaco altera o efeito de outro, por competição metabólica ou por ação em receptores comuns.',
];
const out = process.argv[2];
writeFileSync(out, await buildFixturePdf(pages));
console.log('written', out);
