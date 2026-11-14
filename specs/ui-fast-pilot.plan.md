# UI Fast Pilot — Plano

## Funcionalidade

Primeiro acesso: uma conta nova chega à tela Hoje e consegue abrir o formulário de criação de aula.

## Cenários

### 1. Fluxo principal

1. Iniciar o servidor Vite pelo `playwright.config.js`.
2. Iniciar um servidor SmartLearn com banco SQLite descartável.
3. Registrar e autenticar uma conta de teste.
4. Abrir Hoje e confirmar o estado vazio.
5. Acionar “Criar uma aula” e confirmar o formulário de nova unidade.

### 2. Validação

- Confirmar que o estado vazio e a ação esperada estão presentes.
- Confirmar que a navegação abre a tela e o formulário corretos.
- Reprovar o teste se o texto da ação ou qualquer alvo estrutural desaparecer.

### 3. Persistência ou navegação

- A navegação de Hoje para Plano deve ocorrer sem erro.
- O cadastro utiliza banco temporário e é removido ao final.

## Contrato de aceite

- O teste usa somente dados temporários.
- A tela de estado vazio fica visível.
- A ação “Criar uma aula” abre `#screen-plan` e `#plan-new-unit-form`.
- O teste roda isoladamente, com um worker e sem retry.

## Segurança

- Nenhum banco, diretório de fontes ou dado de produção é usado.
- Nenhuma credencial real é usada ou gravada.
- O servidor de teste é encerrado e o diretório temporário é removido.

## Critérios de aprovação

- Todos os passos do fluxo principal passam.
- As asserções críticas falham quando o texto ou destino esperado é alterado.
- O comando reutilizável retorna código 0 em execução limpa.

## Evidências

Serão registrados o comando, contagens, código de saída e tempos das duas execuções no resultado do piloto.
