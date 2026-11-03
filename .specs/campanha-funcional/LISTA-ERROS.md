# Lista de erros identificados (2026-11-01)
Fonte: `.specs/evidence/ui-funcional-2026-11-01/ACHADOS-PARCIAIS.md` + campanha. [x] corrigido e provado, [ ] pendente.

## Produto
- [x] A-01 título longo sem espaços ultrapassava a borda do cartão (corrigido, provado no exe)
- [x] A-07 renomear disciplina: Enter não gravava, Esc não cancelava (corrigido, teste E2E novo falha sem a correção)
- [x] A-08 fim da revisão mostrava "Próxima revisão" em data passada (corrigido, lote J04 exige o novo texto)
- [x] A-05 ordem da validação do formulário de aula (não era defeito: ordem documentada no código)
- [ ] A-02 mesma nota: 66,7% em Estatísticas e 67% no Plano (P2)
- [ ] A-03 "Apagar base local" só responde "não suportado no modo servidor" (P2)
- [ ] A-04 avisos antigos continuam visíveis ao trocar de tela (P2)
- [ ] A-06 criar conta/entrar levam ~840 ms (atrito, não defeito claro)
- [ ] J02 sem botão "Desfazer" para "Revisão feita" (ressalva)
- [ ] J09 provas: não existe entrada na interface (decisão de produto)
- [ ] Farmacologia e Anatomia usam a mesma cor azul padrão (nota)
- [ ] Cores/tema salvos só localmente (decisão sua: salvar também no servidor?)

## Teste e instrumento
- [x] I-01 controle velho esperava 6 s e repetia
- [x] I-02 clique por texto acertava o título, não o botão
- [x] I-03 ação em elemento escondido
- [x] I-04 `expect` aceitava texto escondido
- [x] I-05 painéis alternados exigiam `ensure`
- [x] I-08 seletor CSS com espaço cortado no 1º espaço (usar aspas)
- [x] Lentidão do teste nativo (~25 min): causa provada, guardas e watchdog
- [x] Lentidão da E2E: 2 workers subutilizavam a máquina (1024 s -> 770 s com 3)
- [x] Asserção velha A-08 em `e2e/product-value.spec.js`
- [x] A-09 SEED2c intermitente: `expect` casava com texto de progresso (3 lotes corrigidos)
- [x] A-11 senha no snapshot e 40 pastas de instância esquecidas
- [x] Lotes rodavam concorrentes e se derrubavam (lock + trap, T05)
- [ ] A-10 lotes de borda B07 (3 linhas) e B08 (2 linhas) falham; causa não provada
- [ ] Lotes de borda sem baseline de tempo (planejado para a T06)
- [ ] I-06 aspas escapadas dentro de argumento não entendidas (limitação conhecida)
- [ ] I-07 pasta estranha `C:\c\` criada por caminho errado (apagar: aguardo seu OK)
- [ ] Morte forçada do script deixa a janela aberta até a próxima execução
- [ ] E2E com 4 workers ou máquina carregada: "server not ready" (risco aceito, 3 workers é o padrão)

## Não é erro, depende de você
- Branch `fix/window-opens-on-primary-monitor` provada, não mesclada.
