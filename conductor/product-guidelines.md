# Product Guidelines — SmartLearn (pointer)

Autoridade real: `.specs/STATE.md` (seção "Decisões registradas", DEC-001..DEC-016)
e `.specs/project/INVARIANTS.md`.

Invariantes que mais afetam o cockpit (não duplicar o texto completo aqui):

- **PLATFORMS = WEB + ANDROID + WINDOWS** (fixo). WebView é runtime do
  Windows/Tauri, não uma 4ª plataforma.
- **JAVA_INVARIANT**: JDK/Gradle só como toolchain Android; sem lógica de
  produto em Java/Kotlin manual sem HUMAN_GATE.
- **DEC-013-V2**: fonte é texto livre (`source_text`); tabela `sources` não
  existe.
- **INV-26**: todo gate de closure futuro inclui gate por plataforma ou
  SPEC_DEVIATION aprovado.
- **DONE não existe. Existe PROVEN** — uma task só fica verde após gate TLC
  com evidência (ver `workflow.md` regra 6).
