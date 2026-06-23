# SmartLearn

Aplicação local de estudos e revisões periódicas, construída com uma única base para desktop,
iOS e Android.

## Arquitetura do MVP

- HTML, CSS e JavaScript puro
- Vite como empacotador mínimo
- Tauri 2 para desktop e mobile
- SQLite local nativo via `@tauri-apps/plugin-sql`
- Sem backend, Supabase ou banco remoto
- Desktop como primeiro alvo; Android posterior; iOS preparado para build em Apple/Mac

As regras funcionais e o plano de execução estão em [`.specs/`](.specs/).

## Pré-requisitos para desktop no Windows

- Node.js e npm
- Rust estável com target `x86_64-pc-windows-msvc`
- Visual Studio Build Tools 2022 com workload C++ para desktop
- Microsoft Edge WebView2 Runtime

## Instalação

```bash
npm install
```

## Comandos

```bash
npm run dev
npm run build
npm run tauri dev
npm run tauri build
```

`npm run dev` serve apenas o frontend Vite. A validação funcional com APIs nativas deve usar
`npm run tauri dev`.

## SQLite

O pacote JavaScript `@tauri-apps/plugin-sql` já faz parte da base. O registro Rust, as permissões,
as migrations e a API `DB.*` serão implementados exclusivamente na TASK-002. Nenhum arquivo fora
de `src/db.js` poderá executar SQL diretamente.

## Alvos móveis

Android e iOS reutilizam esta mesma base Tauri 2. A toolchain Android será preparada em task
posterior. O build real de iOS exige macOS, Xcode e ambiente Apple.

## Git

Cada task deve produzir um commit próprio e deixar o repositório funcional. Codex cuida da
integração com GitHub, branches remotas e pull requests.
