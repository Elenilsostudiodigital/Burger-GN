@echo off
setlocal
cd /d "%~dp0"
echo Iniciando Burger GN Print Agent em segundo plano...
echo Nao e preciso deixar esta janela aberta.
echo.
set "INST=%LOCALAPPDATA%\BurgerGN\print-agent"
if exist "%INST%\start-hidden.vbs" (
  "%SystemRoot%\System32\wscript.exe" //B "%INST%\start-hidden.vbs"
) else (
  "%SystemRoot%\System32\wscript.exe" //B "%~dp0start-hidden.vbs"
)
set "OK=0"
set "NODE_EXE="
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE for /f "delims=" %%i in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%i"
for /L %%n in (1,1,15) do (
  if defined NODE_EXE (
    "%NODE_EXE%" -e "fetch('http://127.0.0.1:19191/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >nul 2>&1
  ) else (
    curl.exe -fsS --max-time 1 http://127.0.0.1:19191/health >nul 2>&1
  )
  if not errorlevel 1 (
    set OK=1
    goto :done
  )
  timeout /t 1 /nobreak >nul
)
:done
echo.
if "%OK%"=="1" (
  echo Agente online em http://127.0.0.1:19191
  echo Pode fechar esta janela. O watchdog mantem o agente ligado.
) else (
  echo Nao foi possivel confirmar o agente.
  echo Solucao definitiva: execute UMA VEZ install-autostart.bat neste PC.
)
echo.
if /i not "%1"=="/nopause" pause
