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

Android e iOS reutilizam esta mesma base Tauri 2.

### Android validado

Ambiente validado em 2026-06-23:

- `ANDROID_HOME=C:\Users\Ariel\AppData\Local\Android\Sdk`
- `NDK_HOME=C:\Users\Ariel\AppData\Local\Android\Sdk\ndk\27.0.12077973`
- JDK 17 Microsoft
- Android SDK Platform 36
- Build Tools 36.0.0
- NDK 27.0.12077973
- Emulador `SmartLearn_API_36`
- Rust targets Android: `aarch64-linux-android`, `armv7-linux-androideabi`, `i686-linux-android`, `x86_64-linux-android`

Comandos usados:

```bash
npx tauri android init --ci
npx tauri android build --debug --target x86_64 --apk --ci
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
adb shell monkey -p com.devulsky.smartlearn.debug 1
```

Resultado validado:

- APK debug gerado.
- App instalado no emulador.
- Tela Hoje abriu sem tela branca.
- Processo Android permaneceu ativo.
- Logcat sem `FATAL EXCEPTION`/`AndroidRuntime` para o app.

`src-tauri/gen/` permanece ignorado no Git porque é artefato gerado pela CLI Tauri e pode ser recriado.

### iOS

iOS permanece preparado na mesma base Tauri 2. Build real de iOS não foi validado neste ambiente,
pois exige macOS, Xcode e toolchain Apple.

## Git

Cada task deve produzir um commit próprio e deixar o repositório funcional. Codex cuida da
integração com GitHub, branches remotas e pull requests.
