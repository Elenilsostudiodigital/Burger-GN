@echo off
setlocal EnableExtensions
title Burger GN - Instalar agente de impressao
cd /d "%~dp0"

echo.
echo  Burger GN — instalacao definitiva do agente de impressao
echo  Inicio automatico no Windows + religar se o processo cair.
echo  Sem arquivos .ps1 e sem janela de CMD no uso diario.
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

set "DST=%LOCALAPPDATA%\BurgerGN\print-agent"
set "WSCRIPT=%SystemRoot%\System32\wscript.exe"
set "VBS=%DST%\start-hidden.vbs"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
echo Pasta: %DST%
if not exist "%DST%" mkdir "%DST%"

echo Copiando arquivos...
copy /Y "%~dp0server.mjs" "%DST%\server.mjs" >nul
copy /Y "%~dp0watchdog.mjs" "%DST%\watchdog.mjs" >nul
copy /Y "%~dp0start-hidden.vbs" "%DST%\start-hidden.vbs" >nul
copy /Y "%~dp0protocol-launch.vbs" "%DST%\protocol-launch.vbs" >nul
copy /Y "%~dp0startup-logon.vbs" "%DST%\startup-logon.vbs" >nul
copy /Y "%~dp0run-watchdog.cmd" "%DST%\run-watchdog.cmd" >nul
del /f /q "%DST%\launch.cmd" >nul 2>&1
del /f /q "%DST%\register-autostart.vbs" >nul 2>&1
del /f /q "%DST%\create-startup-shortcut.ps1" >nul 2>&1
del /f /q "%~dp0create-startup-shortcut.ps1" >nul 2>&1
> "%DST%\node-path.txt" echo %NODE_EXE%
echo Arquivos copiados.

REM Startup folder gets a VBS launcher by file copy. Never .ps1.
echo Copiando launcher para Inicializar...
if not exist "%STARTUP%" mkdir "%STARTUP%"
copy /Y "%DST%\startup-logon.vbs" "%STARTUP%\BurgerGN-Print-Agent.vbs" >nul
del /f /q "%STARTUP%\BurgerGN-Print-Agent.lnk" >nul 2>&1
del /f /q "%STARTUP%\BurgerGN-PrintAgent.lnk" >nul 2>&1
echo Launcher em Inicializar.

REM Tasks must launch wscript.exe (GUI), never cmd.exe / .bat / .ps1
echo Registrando tarefas do Windows...
schtasks /Create /TN "BurgerGN Print Agent" /TR "%WSCRIPT% //B \"%VBS%\"" /SC ONLOGON /F
if errorlevel 1 (
  schtasks /Query /TN "BurgerGN Print Agent" >nul 2>&1
  if errorlevel 1 (
    echo Aviso: tarefa de logon nao criada.
  ) else (
    echo Tarefa de logon ja estava registrada.
  )
)
schtasks /Create /TN "BurgerGN Print Agent Watch" /TR "%WSCRIPT% //B \"%VBS%\"" /SC MINUTE /MO 1 /ST 00:00 /F
if errorlevel 1 (
  schtasks /Query /TN "BurgerGN Print Agent Watch" >nul 2>&1
  if errorlevel 1 (
    echo Aviso: tarefa de verificacao nao criada.
  ) else (
    echo Tarefa de verificacao ja estava registrada.
  )
)

echo Registrando protocolo burgergn-print:// ...
reg add "HKCU\Software\Classes\burgergn-print" /ve /d "URL:Burger GN Print Agent" /f >nul
reg add "HKCU\Software\Classes\burgergn-print" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\burgergn-print\DefaultIcon" /ve /d "shell32.dll,77" /f >nul
reg add "HKCU\Software\Classes\burgergn-print\shell\open\command" /ve /d "wscript.exe //B \"%DST%\protocol-launch.vbs\" \"%%1\"" /f >nul
echo Protocolo registrado.

echo Iniciando o agente oculto agora...
"%WSCRIPT%" //B "%DST%\start-hidden.vbs"

set "OK=0"
for /L %%n in (1,1,20) do (
  "%NODE_EXE%" -e "fetch('http://127.0.0.1:19191/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >nul 2>&1
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
