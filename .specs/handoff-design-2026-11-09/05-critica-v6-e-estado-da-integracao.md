# Crítica da V6 e estado da integração (2026-11-10, branch `design/redesign-geral-20261110`)

Pedido do dono: remodelar o design de modo crítico; dizer o que não funciona; alterar só o que estiver claramente certo e deixar para depois o que houver dúvida.
Fonte comparada: `SmartLearn-Codigo-V6-Materiais-QualityExtreme.zip` (SHA-256 `506a9db4…1e5b5`, conferido) contra o app nativo renderizado (Playwright, 1280 e 390 px, claro e escuro).

## 1. Alterado (certo e provado)

| O quê | Por quê | Prova |
|---|---|---|
| Biblioteca "Documentos já enviados": linhas alinhadas em um único bloco (nome à esquerda, páginas e ações à direita, divisórias, realce ao passar/focar) | No nativo cada linha tinha os botões em posição diferente, colados ao nome | Capturas antes/depois, 1280 e 390 px |
| Busca, ordenação (original, A–Z, Z–A, mais páginas) e paginação de 12 em 12, sobre a lista real do servidor; total contado antes de paginar | Pedido do dossiê; a V6 mostrava isso só com dados fictícios | `test/materials-library.test.js` (5), `e2e/materials-library.spec.js` (4, inclui axe) |
| Controles só aparecem a partir de 7 documentos | Com 3 documentos busca e ordem seriam ruído (a V6 mostra sempre) | e2e "few documents" |
| Rótulos "Por páginas"/"Por título da seção" em caixa alta pequena | Hierarquia mais clara, só CSS | captura |
| Só tokens `--color-*`: vale para os 24 temas sem paleta nova | Regra do dossiê e do contrato 04 | CSS no fim de `src/styles.css` |

| Editor da aula, aba **Fonte**: fatos em tabela com coluna de rótulos (linha 1 coluna no celular) | Texto corrido sem estrutura; a V6 tinha a mesma ideia sobre as mesmas classes nativas | Capturas antes/depois 1280 claro/escuro e 390 |
| Editor: resumo com corpo 17 px / entrelinha 1,8; textos das abas Fonte e Revisão limitados a 75 caracteres | Linhas de ~120 caracteres cansam a leitura | Capturas |
| Botão "Remover" da biblioteca escurecido com a cor de texto do tema | **Defeito anterior, encontrado pelo teste de temas**: o vermelho fixo `#dc2626` não chegava a 4,5:1 em 4 temas claros (catppuccin-latte, gruvbox-light, solarized-light, dracula-light). Reproduzido também com o CSS original do HEAD | `e2e/materials-themes.spec.js`: todos os temas passam |
| Prova por tema: `e2e/materials-themes.spec.js` (biblioteca e abas Resumo, Fonte e Revisão, 390 px, todas as opções de tema; axe e rolagem lateral) | Dossiê exige 24 temas | PASS em 1,8 min (baseline a registrar) |

Mantidos: ids `#sources-*`, ações `open-source`/`remove-source`, i18n (catálogo + texto de reserva), `aria-disabled` no paginador (não perde o foco).

## 2. Não funciona / não portei, e por quê

1. **Identidade visual da V6 contradiz o app.** Roxo, logotipo "S", títulos em serifa, lema "APRENDER · REVISAR · EVOLUIR", rótulo "ESPAÇO DE ESTUDO", menu ativo preenchido. O app usa azul e sans pelos tokens e 24 temas. Aplicar isso muda as seis abas e a superfície protegida de Estatísticas. DECISÃO DO DONO: a identidade da V6 vale para o app todo?
2. **`experience.css` não é portável como está.** Depende da classe-raiz `.sl-redesign`, de tokens `--sl-*` e de classes que `experience.mjs` injeta (`sl-library-heading`, `sl-source-identity`…), que não existem no DOM nativo; tem regras globais que alterariam outras abas; textos em JS fora do catálogo i18n.
3. **Fluxo em três páginas (biblioteca → documento → editor, com "Voltar à biblioteca").** No nativo biblioteca e documento dividem o mesmo cartão. Mudar é arquitetura de informação (classe C do contrato 04). Adiado.
4. **"Outras formas de selecionar" esconde busca por título e índice num `<details>`.** O dono acabou de pôr o intervalo primeiro e a busca visível; esconder o índice reduz o que se acha. Adiado.
5. **Estado por documento ("1 resumo preparado") e botão "Preparar resumo".** A lista `/v1/sources` não traz contagem de rascunhos; exige API. O texto nativo "Gerar destas páginas" é deliberado. Adiado.
6. **"Mostrar mais 20" na busca de títulos mentiria.** Confirmado no código: `findTopicSections` limita a 8 e a aprovação por ordinal usa 50 (`server/src/services/section-spans.js:177`, `content-proposals.js:290`). Corrigir é mudar a API; não é CSS. Adiado e registrado.
7. **Data da aula e histórico de versões do resumo.** `lessonDate` não existe no servidor, migrações nem cliente; não há tabela nem endpoint de versões. Controles dessas funções NÃO devem ser portados (seriam promessa falsa). Exigem migração e autorização do dono.
8. **Estatísticas V5.** Superfície protegida (ADR-0001); a matemática da prévia difere de `src/analytics.js`. Não tocada.
9. **`integration/install.cjs`.** Não usado (pin de 3 blobs antigos, cobre só a fase inicial).

10. **Rótulo "Data da aula" no diálogo "Aceitar a aula" está errado em relação ao que grava.** No código nativo esse campo envia `studyDate` (a data de ESTUDO, âncora das 16 revisões), mas o texto é `editor.accept.date: 'Data da aula'` (`src/i18n/locales/pt-BR/editor.js:147`); a pré-visualização também chama de `studyDate`. O dossiê trata data da aula e data de estudo como coisas diferentes. Não renomeei: é semântica de produto. DECISÃO DO DONO: renomear para "Data do estudo" enquanto a data da aula não existe?
11. **Aviso do hook de design `flat-type-hierarchy` em `index.html`** (origem desconhecida, anterior a esta sessão): a escala tipográfica global é achatada. Corrigir mexe em todas as telas e na superfície protegida; o dono já havia mandado não tocar na tipografia. Deixado como está.

## 3. Não verificado

- WebView2/Tauri (só Chromium headless); suíte E2E completa; leitor de tela; diálogo "Aceitar a aula" e aba Questões não foram reestilizados (só inspecionados: ok como estão).
- A branch `design/*` não está em `scripts/work-branches.json`; o launcher do app recusa nela. Nada foi mudado nisso.
