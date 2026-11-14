# LEITURA-1 e FIGURAS-1 — resumo da conversa de 2026-11-14

Para retomar depois. Fonte de verdade do estado: Git e testes; o quadro está em `plan.md` (tarefas LEITURA-1 e FIGURAS-1). Nada foi commitado ou enviado. Branch `design/redesign-geral-20261110`, HEAD `bfa5a455`, árvore com várias frentes misturadas.

## 1. Objetivo

O aluno de medicina, leigo em tecnologia, envia qualquer documento (PDF novo, velho, digital, escaneado ou foto de página), marca as páginas e recebe só o resumo e as questões prontos. Ele não vê texto extraído, aprovação, motor de OCR nem etapas técnicas. Se uma página for ilegível, no máximo uma frase simples (ex.: "A página 5 está ilegível. Tente uma foto mais nítida."). A solução precisa ter licença livre.

## 2. Desenho decidido

- Para cada página: texto do pdf.js → conferência automática de qualidade → OCR só nas páginas reprovadas → só texto aprovado vai à IA.
- Ferramenta escolhida: `@xberg-io/xberg` v1.3.10 (antigo Kreuzberg), licença MIT, OCR com Tesseract embutido. Escolhida por nota entre ~12 candidatos (licença, estrelas, atividade, aderência). Eliminados por licença: scribe.js (AGPL-3.0) e MinerU (licença própria).
- O pdf.js continua lendo o texto (índice, títulos, colunas, hifenização). O OCR é reserva, não substituição.
- PDF: sobe ao servidor, é lido por inteiro e depois apagado. O servidor não guarda material do aluno.
- Figuras: ao gerar o resumo das páginas marcadas, as figuras dessas páginas são extraídas sem custo de IA. O agente que escreve o resumo escolhe quais inserir e onde. Começar escolhendo pela legenda e página (barato); mandar a imagem só quando faltar legenda.
- Só ficam guardadas as figuras inseridas no resumo, embutidas no documento. Todas as outras e o PDF são excluídos ao fim da geração. Remover a figura do resumo apaga o arquivo.
- Servidor barato: figura reduzida e comprimida (ex.: WebP, ~800 px de largura, ~30–80 KB), teto de figuras por resumo (~10–15), cota de espaço por aluno, nada órfão. O `sharp` já está no projeto. Referência: 100 resumos × 12 figuras × 60 KB ≈ 70 MB por aluno.

## 3. O que foi feito (e está no working tree)

- `server/package.json` e `server/package-lock.json`: dependência `@xberg-io/xberg` adicionada (0 vulnerabilidades).
- `server/src/pdf/ocr-fallback.js` (novo): `pageTextLooksBad(text)` e `ocrPages(bytes, pageIndexes)`. Nunca lança erro; se o OCR não estiver disponível, a página fica como o pdf.js leu.
- `server/src/pdf/extract-worker.js`: importa o helper, copia os bytes do PDF antes do pdf.js (`ocrBytes`) e, depois de ler as páginas, roda OCR nas páginas reprovadas.
- `plan.md`: LEITURA-1 reescrita (sem texto visível ao aluno) e FIGURAS-1 criada; `quadro.html` regerado.
- `ocr-quality.mjs` (nesta pasta): script de medição. Para rodar, copiar para `server/` (importa `./src/pdf/ocr-fallback.js` e usa `sharp`) e executar `node ocr-quality.mjs`.

## 4. Provas

- Testes `server/test/pdf-extraction.test.js` e `server/test/extraction-text-fidelity.test.js` passaram (pelo vigia, 16 s). Página em branco continua `EMPTY`.
- PDF só de imagem sintético lido em ~2 s, com acentos certos.
- Medição com 78 palavras (doses e exames), cada divergência listada:

| Condição | Divergentes | Pontuação | Acento | Conteúdo |
|---|---|---|---|---|
| Limpo | 4 | 4 | 0 | 0 |
| Baixa resolução | 5 | 4 | 0 | 1 ("Na+" → "Nat") |
| Girado 3° | 6 | 4 | 2 ("cardíaca", "às") | 0 |
| Borrado | 5 | 4 | 1 ("cardíaca") | 0 |
| Foto ruim | 8 | 7 | 0 | 1 ("ejeção" → "ejcção") |

Pontuação: "–" vira "-" em faixas, ponto depois de "mg)" some, às vezes ";" vira ":". Números e unidades saíram corretos nos cinco testes, sem dígito trocado. A primeira medição, por percentual de palavras, misturava pontuação com erro de palavra e foi substituída por esta. Tempo: ~1–2,6 s por página.

Conclusão: o PDF de texto continua exato; o OCR não chega a 100%. Nas páginas escaneadas: 0 a 2 erros de palavra em ~78, mais divergências de pontuação.

## 5. Não provado (limites)

- Os dados de teste são sintéticos (fonte limpa). Livro escaneado real e foto de celular real não foram medidos.
- Foto avulsa (imagem solta, sem PDF): o caminho não está ligado; só PDF foi testado.
- Primeira leitura: o Tesseract baixa os dados de idioma (`por`, `eng`) e precisa de internet; falta definir como empacotar.
- O binário nativo instalado é `win32-x64`. Não foi verificado que o pacote funcione no sistema operacional do servidor.
- Licenças dos modelos e de dependências (onnxruntime, dados de treinamento do Tesseract) não foram conferidas. O pandoc (GPL) só entraria para arquivos Office; não instalar.
- Opiniões de usuários sobre o xberg em livros médicos não foram coletadas.
- Tamanho do pacote: 116 MB de `node_modules`.
- Importação lendo tudo: livro escaneado de 500 páginas levaria ~8 min (~1 s por página) em segundo plano.

## 6. O que o servidor faz hoje (a mudar)

O servidor grava o PDF e o serve em `GET /v1/sources/:id/file`. Quem usa essa rota: `src/pdf-crop-dialog.js` (recorte de figura), `src/source-details-ui.js` (abrir o original na página citada, 2 pontos) e `src/visual-assets-api.js`. Apagar o PDF após a leitura quebra essas funções até serem tratadas. Pergunta em aberto: o app guarda uma cópia do PDF no dispositivo do aluno, para ele rever o original?

## 7. Próximos passos

1. Importação lê tudo de uma vez (texto, OCR das reprovadas, figuras), grava no banco e então apaga o PDF.
2. Extrair as figuras das páginas marcadas (`images.extractImages` do xberg), com página e legenda; num PDF escaneado a página é uma imagem só, então recortar a figura exige detecção de layout (modelos ainda não baixados).
3. Agente escolhe e insere figuras; validar que só entram figuras da lista; reduzir e comprimir; tetos e cota.
4. Marcar internamente a página "lida por OCR" e avisar a IA que números e acentos podem ter erro; frase simples ao aluno quando a página for ilegível.
5. Ligar o caminho de foto avulsa.
6. Medir com 3 a 5 páginas de um livro real escaneado ou fotografado.
7. Conferir licenças dos modelos e o binário no sistema do servidor.
8. Decisão sobre direitos autorais (figuras do livro em resumo do aluno) é do autor, com advogado; a versão redesenhada por IA é a mais segura.

## 8. Decisões do autor nesta conversa

- Licença livre; o aluno não vê nada técnico.
- PDF sobe, é lido e apagado; só ficam as figuras inseridas no resumo; serviço barato.
- A inserção de figuras é feita pelo agente que lê o texto; o custo extra de tokens é aceito.
- Plugins: nenhum foi desabilitado. Em `~/.claude/settings.json` continuam ligados `superpowers`, `code-review`, `skill-creator`, `context7`, `frontend-design`, `code-simplifier`, `typescript-lsp`, `conductor` e `caveman`. Os conectores da conta (`engineering`, `design`, `anthropic-skills`) não vêm desse arquivo.

## 9. Pendências do autor que continuam

Ver Materiais na prévia 5188 com a conta dele; decidir o commit (a árvore mistura frentes); autorizar chamadas reais de IA para medir auditoria e fidelidade; política de armazenamento de PDF (agora decidida acima, falta implementar); revisão médica dos conteúdos gerados.
