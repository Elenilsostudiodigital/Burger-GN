@echo off
setlocal EnableExtensions
title Burger GN - Instalar agente de impressao
cd /d "%~dp0"

echo.
echo  Burger GN — instalacao definitiva do agente de impressao
echo  Inicio automatico no Windows + religar se o processo cair.
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado neste PC.
  echo Instale o Node.js LTS em https://nodejs.org e rode este instalador de novo.
  if /i not "%~1"=="/nopause" pause
  exit /b 1
)

set "NODE_EXE="
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
set "PF86=%ProgramFiles(x86)%"
if not defined NODE_EXE if defined PF86 if exist "%PF86%\nodejs\node.exe" set "NODE_EXE=%PF86%\nodejs\node.exe"
if not defined NODE_EXE (
  for /f "delims=" %%i in ('where node 2^>nul') do (
    if not defined NODE_EXE set "NODE_EXE=%%i"
  )
)

if not defined NODE_EXE (
  echo ERRO: nao foi possivel localizar node.exe
  if /i not "%~1"=="/nopause" pause
  exit /b 1
)

echo Node: %NODE_EXE%
"%NODE_EXE%" -v
echo.

set "DST=%LOCALAPPDATA%\BurgerGN\print-agent"
if not exist "%DST%" mkdir "%DST%"

copy /Y "%~dp0server.mjs" "%DST%\server.mjs" >nul
copy /Y "%~dp0watchdog.mjs" "%DST%\watchdog.mjs" >nul
copy /Y "%~dp0start-hidden.vbs" "%DST%\start-hidden.vbs" >nul
copy /Y "%~dp0protocol-launch.vbs" "%DST%\protocol-launch.vbs" >nul

echo @echo off> "%DST%\run-watchdog.cmd"
echo cd /d "%%~dp0">> "%DST%\run-watchdog.cmd"
echo "%NODE_EXE%" watchdog.mjs>> "%DST%\run-watchdog.cmd"

echo @echo off> "%DST%\launch.cmd"
echo wscript.exe //B "%DST%\start-hidden.vbs">> "%DST%\launch.cmd"

set "LAUNCH=%DST%\launch.cmd"

schtasks /Create /TN "BurgerGN Print Agent" /SC ONLOGON /RL LIMITED /F /TR "%LAUNCH%" >nul 2>&1
if errorlevel 1 (
  echo Aviso: tarefa ONLOGON nao criada. Usando Startup + minuto.
) else (
  echo Tarefa ONLOGON: BurgerGN Print Agent
)

schtasks /Create /TN "BurgerGN Print Agent Watch" /SC MINUTE /MO 1 /RL LIMITED /F /TR "%LAUNCH%" >nul 2>&1
if errorlevel 1 (
  echo Aviso: tarefa MINUTE nao criada.
) else (
  echo Tarefa MINUTE: BurgerGN Print Agent Watch
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0create-startup-shortcut.ps1"
if errorlevel 1 (
  echo Aviso: atalho de Inicializacao nao criado.
) else (
  echo Atalho de Inicializacao do Windows criado.
)

reg add "HKCU\Software\Classes\burgergn-print" /ve /d "URL:Burger GN Print Agent" /f >nul
reg add "HKCU\Software\Classes\burgergn-print" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\burgergn-print\DefaultIcon" /ve /d "shell32.dll,77" /f >nul
reg add "HKCU\Software\Classes\burgergn-print\shell\open\command" /ve /d "wscript.exe //B \"%DST%\protocol-launch.vbs\" \"%%1\"" /f >nul
echo Protocolo burgergn-print:// registrado.

echo.
echo Iniciando o agente agora...
wscript //B "%DST%\start-hidden.vbs"

set "OK=0"
for /L %%n in (1,1,20) do (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:19191/health; if ($r.StatusCode -eq 200) { exit 0 } } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 (
    set OK=1
    goto health_done
  )
  timeout /t 1 /nobreak >nul
)
:health_done

echo.
if "%OK%"=="1" (
  echo  OK — agente online em http://127.0.0.1:19191
  echo  Vai iniciar sozinho no login do Windows.
  echo  No painel, use o botao Reconectar Impressora se cair.
) else (
  echo  AVISO — instalado, mas o health ainda nao respondeu.
  echo  Verifique o Node.js e o arquivo:
  echo  %DST%\agent.log
)
echo.
echo Pasta instalada: %DST%
echo.
if /i not "%~1"=="/nopause" pause
if "%OK%"=="1" exit /b 0
exit /b 2
