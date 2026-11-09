# Senha e contas pela linha de comando

Dono do sistema: você tem controle total das contas sem passar por mim nem pela tela.

## Como as contas funcionam

- Cada instalação tem UM banco SQLite. As contas ficam dentro dele, e cada conta só enxerga os próprios dados.
- Uma senha não tem banco próprio: o e-mail identifica a conta; a senha só prova quem é.
- A senha nunca é guardada: grava-se um hash scrypt (campos `password_hash`, `password_salt`, `password_params` na tabela `users`). Não existe como "ler" a senha, só trocá-la.
- Mínimo de 8 caracteres.

## Bancos (quem usa qual)

| Instalação | Banco |
|---|---|
| Homologação (atalho "SmartLearn Homologação") | `C:\Users\Ariel\SmartLearn-Homologacao-Data\smartlearn-homologacao.db` |
| App anterior / Oficial | `%APPDATA%\com.devulsky.smartlearn\smartlearn-server\smartlearn.db` |
| DEV | `C:\Users\Ariel\SmartLearn-DevData\smartlearn-dev.db` |

## Trocar a senha (recomendado)

1. Feche o app que usa o banco.
2. Num terminal interativo seu (PowerShell 5.1: sem `&&`, caminhos no estilo `C:\...`):

```powershell
cd C:\Projetos\SmartLearn-combinada
node scripts/homologation-set-password.mjs ariel@com.com
# outro banco: acrescente  --db "C:/caminho/do/banco.db"
```

3. Digite a nova senha (escondida) duas vezes. O script grava o hash novo e encerra todas as sessões abertas da conta.
4. Abra o app e entre.

O script aceita senha de qualquer tamanho (só avisa abaixo de 8, mínimo do app no cadastro e no reset por token; o login não confere tamanho). Recusa: senhas diferentes, vazia, e-mail inexistente. Em qualquer recusa nada é alterado.

## Alternativa: token de uso único

```bash
node server/scripts/reset-password.mjs ariel@com.com --db "C:/caminho/do/banco.db"
```

Mostra um token UMA vez (vale 30 min). Quem tiver o token completa a troca por `POST /v1/auth/reset-password` com `{ token, newPassword }`. Não há tela para isso.

## Ver as contas de um banco (só leitura)

```bash
node --input-type=module -e "import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync(process.argv[1],{readOnly:true}); console.log(db.prepare('select id,email,created_at from users').all())" "C:/caminho/do/banco.db"
```

## Cuidados

- Faça backup do banco (copiar `.db`, `.db-wal`, `.db-shm` com o app fechado) antes de mexer.
- Nunca troque senha com o app aberto no mesmo banco.
- Os scripts não aparecem em chat nem em log: a senha só passa pelo seu terminal.
