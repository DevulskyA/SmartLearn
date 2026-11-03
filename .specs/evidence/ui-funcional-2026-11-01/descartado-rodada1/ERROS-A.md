# ERROS lote A (J00 a J06)

Build: DEV 04930d8, app desktop original, instância isolada. Conta de teste: aluno1@example.com.

Formato: ID | jornada/passo | esperado | observado | gravidade | como reproduzir | print | console/rede

E-01 | J00 / Plano > Gerenciar disciplinas | Disciplina recém-criada aparece nos seletores e filtros da mesma tela sem recarregar | Após criar "Farmacologia" e "Anatomia" no painel, o seletor "Disciplina" de "+ Nova aula" e o filtro "Filtrar por disciplina" mostravam só "Selecione…"/"Todas as disciplinas". Só apareceram após F5 (reload) | P1 (disciplina nova some dos seletores até recarregar) | 1. Abrir Plano. 2. Clicar "Gerenciar disciplinas". 3. "+ Nova disciplina" > "Farmacologia" > Adicionar. 4. Repetir com "Anatomia". 5. Clicar "+ Nova aula" e abrir o seletor "Disciplina": só "Selecione…". 6. Apertar F5: as duas aparecem. | J00-nova-aula-seletor-vazio.png | sem erro de console (recheck em J06)

E-02 | J00 / Conta > Criar conta | Feedback visível ao enviar senha curta (dica diz "Mínimo de 15 caracteres") e e-mail inválido | Clicar "Criar conta" com e-mail "abc" e senha "curta" não mostra mensagem nenhuma; nenhuma requisição de cadastro aparece no console | P2 (sem feedback) | 1. Conta > "Ainda não tem conta? Criar uma". 2. E-mail "abc", senha "curta". 3. Clicar "Criar conta". 4. Nada muda na tela. | J00-cadastro-email-senha-curta.png | nenhum erro no console

E-03 | J00 / Plano (alertas) | Mensagens de sucesso/aviso somem ao trocar de tela | Mensagens antigas ("Rascunho gerado. Revise antes de aceitar.", "Aula criada: 3 exercícios...", "Ainda não há evidência...", "Apagar todos os dados ainda não é uma operação suportada...") continuam aparecendo em todas as telas depois de terem sido mostradas uma vez | P2 (mensagem velha exibida como atual) | 1. Gerar e aceitar um rascunho em Materiais. 2. Ir a Plano, Estatísticas, Configurações. 3. A faixa de alertas continua com a mensagem de aceite. | J01-estatisticas-apos-prep.png | nenhum
