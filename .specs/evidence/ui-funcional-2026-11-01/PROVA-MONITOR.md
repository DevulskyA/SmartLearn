# Prova na janela real: a janela lembra o monitor (branch fix/window-opens-on-primary-monitor, c65f53e)

Monitores da máquina: `\.\DISPLAY1` (não primário, x -1440..0, 1440x900) e `\.\DISPLAY2` (primário, x 0..1920, 1920x1080).

| Passo | Resultado medido (Win32 GetWindowRect) |
|---|---|
| Primeira abertura, dados novos | left=-1360, top=40, 1296x859: **centralizada no monitor 1 (DISPLAY1)** |
| Movida para o monitor 2 (x=300, y=100) | `window-state.json` gravado em ~3 s: `{"x":300,"y":100,"width":1280,"height":820,"maximized":false}` |
| Fechada e reaberta com os mesmos dados | left=300, top=100: **reabriu no monitor 2, mesma posição e tamanho** |

Cobertura de código: 9 testes Rust de `window_state` passam (monitor ausente, coordenadas negativas, tamanho maior que o monitor, ida e volta do arquivo, descarte de arquivo corrompido).
