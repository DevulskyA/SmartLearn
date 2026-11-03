# Tech Stack — SmartLearn (pointer)

Autoridade real: `.specs/STATE.md` DEC-001, DEC-008, DEC-009, DEC-011;
`package.json` / `server/package.json`.

- **Client:** HTML/CSS/JS puro (sem framework), Vite como empacotador.
- **Shells nativos:** Tauri 2 (Windows desktop, Android). WebView aponta
  para o servidor central — não é autoridade de dados própria (DEC-009,
  T42/T43).
- **Servidor central:** Node.js + Fastify (`server/src/app.js`), autoridade
  única dos dados (SERVER_CENTRAL_DECISIONS em STATE.md).
- **Banco:** SQLite + WAL no servidor (`server/src/db.js`); `better-sqlite3`.
- **Testes:** `node:test` (client/shared + server), Playwright (`e2e/`),
  `cargo test` (Rust/Tauri).
- **CI:** `.github/workflows/ci.yml` (T05).
