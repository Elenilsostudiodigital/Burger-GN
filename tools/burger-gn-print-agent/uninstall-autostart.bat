@echo off
setlocal
echo Removendo inicio automatico do Burger GN Print Agent...
schtasks /Delete /TN "BurgerGN Print Agent" /F >nul 2>&1
schtasks /Delete /TN "BurgerGN Print Agent Watch" /F >nul 2>&1
del /f /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\BurgerGN-Print-Agent.lnk" >nul 2>&1
reg delete "HKCU\Software\Classes\burgergn-print" /f >nul 2>&1
echo Tarefas, atalho e protocolo removidos.
echo A pasta %LOCALAPPDATA%\BurgerGN\print-agent foi mantida.
if /i not "%1"=="/nopause" pause
