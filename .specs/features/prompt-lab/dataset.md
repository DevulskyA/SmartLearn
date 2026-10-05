# Prompt Lab — conjunto de dados (T-F5-01) — RASCUNHO PARA APROVAÇÃO (HG-08)

Regra central: unidades reais ficam FORA do repositório e são referenciadas só por caminho externo. Nenhum texto de livro, PDF, trecho ou saída bruta entra no Git; relatórios citam página/questão e números.

## Armazenamento externo (PROPOSED, HG-08)
- Raiz de laboratório: `C:\Users\Ariel\SmartLearn-PromptLab\` (já existe; `runs\` e `work\`). Fora do repositório; listar o diretório no `.gitignore` global.
- Saídas das rodadas: `C:\Users\Ariel\SmartLearn-PromptLab\runs\<rodada>\` (já usado pelo baseline).
- O banco do laboratório (`work\lab.db`) é CÓPIA; o datastore humano `C:\Users\Ariel\SmartLearn-DevData` nunca é aberto pelo laboratório.

## Unidades de referência
| Unidade | Fonte (referência externa) | Observação |
|---------|----------------------------|------------|
| U1 | PDF Costanzo, "Glomerular Filtration", pp. 267-273, material local já existente (copiado para o armazenamento do produto como `...\SmartLearn-DevData\sources\<hash>.pdf`; o laboratório deve referenciar sua própria cópia, não a do banco humano; qual cópia o baseline usou: A CONFIRMAR) | única unidade avaliada até agora (baseline v5 e 3 gerações, `valid4-span-rerun.md`) |
| U2..Un | NENHUMA definida. Candidatas: outras seções do MESMO livro já local | HG-08: NÃO se pede outro PDF; ampliar só com material já existente na máquina |

## Registro por unidade (campos, sem conteúdo do livro)
`unit_id`, caminho externo da fonte, sha256 da fonte, páginas, escopo aprovado (seção), idioma de preferência, hash da entrada normalizada (igual em todas as variantes), versão do prompt/esquema, commit do harness, data.

## Regras
1. Mesma unidade e mesma entrada para todas as variantes de uma rodada.
2. Uma unidade por rodada de avaliação humana (HG-06).
3. Antes de qualquer execução, conferir que o caminho está sob `SmartLearn-PromptLab` (a salvaguarda do runner recusa outros).
4. Nova unidade exige decisão sua; este rascunho não solicita PDFs.
