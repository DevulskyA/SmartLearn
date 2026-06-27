@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title SmartLearn - Compilar e Testar

echo ==================================================
echo    SmartLearn  -  Compilar e Testar
echo ==================================================
echo.

echo [1/3] Encerrando instancias abertas do SmartLearn...
echo        (necessario: com o app aberto, o .exe fica travado e a compilacao falha)
taskkill /IM smartlearn.exe /F >nul 2>&1
if "%errorlevel%"=="0" (
  echo        instancias encerradas.
) else (
  echo        nenhuma instancia aberta.
)
echo.

echo [2/3] Verificando dependencias...
if not exist "node_modules" (
  echo        instalando dependencias ^(npm install^)...
  call npm install
  if errorlevel 1 goto erro
) else (
  echo        node_modules OK.
)
echo.

echo [3/3] Compilando o frontend ^(vite build^) como teste de sanidade...
call npm run build
if errorlevel 1 goto erro
echo        frontend compilou sem erros.
echo.

:menu
echo ==================================================
echo   O que voce quer fazer agora?
echo.
echo     [D]  Testar em modo DEV  ^(hot-reload, abre a janela^)
echo     [R]  Gerar RELEASE       ^(.exe + instalador definitivos^)
echo     [Q]  Sair
echo ==================================================
set "opcao="
set /p "opcao=Opcao [D/R/Q]: "

if /i "%opcao%"=="D" goto dev
if /i "%opcao%"=="R" goto release
if /i "%opcao%"=="Q" goto fim
echo Opcao invalida.
echo.
goto menu

:dev
echo.
echo Subindo modo DEV... feche a janela do app para encerrar.
call npm run tauri dev
goto fim

:release
echo.
echo Gerando build de RELEASE... pode levar alguns minutos.
call npm run tauri build
if errorlevel 1 goto erro
echo.
echo ==================================================
echo   RELEASE pronto.
echo     Executavel : src-tauri\target\release\smartlearn.exe
echo     Instalador : src-tauri\target\release\bundle\
echo ==================================================
goto fim

:erro
echo.
echo *** ERRO na etapa acima. Leia a mensagem logo acima desta linha. ***
echo.
pause
exit /b 1

:fim
echo.
pause
endlocal
