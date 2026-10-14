```bat
@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Hoài My Piper TTS Server

:MENU
cls
echo ====================================================================
echo                  HOAI MY PIPER TTS SERVER
echo ====================================================================
echo.
echo   [1] Start App       - Khoi dong ung dung
echo   [2] Build           - Build giao dien moi va khoi dong
echo   [3] Exit            - Thoat
echo   [4] GitHub Pull     - Cap nhat code tu GitHub
echo.
echo ====================================================================
echo.
echo Tu dong chon Start App sau 3 giay neu khong co thao tac...
echo.

choice /c 1234 /n /t 6 /d 1 /m "Chon 1, 2, 3 hoac 4: "

if errorlevel 4 goto PULL
if errorlevel 3 goto EXIT
if errorlevel 2 goto BUILD
if errorlevel 1 goto START

:BUILD
echo.
echo ====================================================================
echo Dang build frontend...
echo ====================================================================
call npm run build

if errorlevel 1 (
    echo.
    echo [LOI] Build that bai! Ung dung chua duoc khoi dong.
    pause
    goto MENU
)

echo.
echo [THANH CONG] Build hoan tat!
goto START

:START
echo.
echo ====================================================================
echo Dang chuan bi khoi dong ung dung...
echo ====================================================================

if not exist "node_modules" (
    echo [CANH BAO] Chua co node_modules.
    echo Dang chay Setup.bat...
    call "%~dp0Setup.bat"

    if errorlevel 1 (
        echo [LOI] Setup that bai!
        pause
        goto MENU
    )
)

if not exist "dist" (
    echo [CANH BAO] Chua co thu muc dist.
    echo Tu dong build frontend...
    call npm run build

    if errorlevel 1 (
        echo [LOI] Build that bai!
        pause
        goto MENU
    )
)

echo.
echo Dang kiem tra cong 3000...

for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000" ^| findstr "LISTENING"') do (
    set "OCCUPIED_PID=%%a"
    if defined OCCUPIED_PID (
        echo Phat hien PID !OCCUPIED_PID! dang su dung cong 3000.
        echo Dang dong tien trinh nay...
        taskkill /f /pid !OCCUPIED_PID! >nul 2>nul
        timeout /t 1 >nul
    )
)

set "NODE_ENV=production"
set "PORT=3000"
set "PIPER_ESPEAK_BRIDGE=0"
set "OPEN_BROWSER=1"

if exist "%ProgramFiles%\eSpeak NG\espeak-ng.exe" (
    set "PATH=%ProgramFiles%\eSpeak NG;!PATH!"
    if exist "%ProgramFiles%\eSpeak NG\espeak-ng-data" (
        set "ESPEAK_DATA_PATH=%ProgramFiles%\eSpeak NG\espeak-ng-data"
    )
) else if exist "%ProgramFiles(x86)%\eSpeak NG\espeak-ng.exe" (
    set "PATH=%ProgramFiles(x86)%\eSpeak NG;!PATH!"
    if exist "%ProgramFiles(x86)%\eSpeak NG\espeak-ng-data" (
        set "ESPEAK_DATA_PATH=%ProgramFiles(x86)%\eSpeak NG\espeak-ng-data"
    )
) else if exist "%~dp0espeak-ng\espeak-ng.exe" (
    set "PATH=%~dp0espeak-ng;!PATH!"
    if exist "%~dp0espeak-ng\espeak-ng-data" (
        set "ESPEAK_DATA_PATH=%~dp0espeak-ng\espeak-ng-data"
    )
)

echo.
echo Server: http://localhost:3000
echo Nhan Ctrl+C hoac dong cua so nay de dung ung dung.
echo.

call npm start

echo.
echo [THONG BAO] May chu da dung.
pause
goto MENU

:EXIT
echo Dang thoat...
exit /b 0

:PULL
echo.
echo ====================================================================
echo Dang cap nhat code tu GitHub...
echo ====================================================================
echo.

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo [LOI] Thu muc hien tai khong phai Git repository!
    pause
    goto MENU
)

git pull --ff-only

if errorlevel 1 (
    echo.
    echo [LOI] Git Pull that bai!
    echo Kiem tra ket noi mang, nhanh Git va cac thay doi local.
    echo Ban co the can xu ly xung dot hoac commit thay doi local.
    pause
    goto MENU
)

echo.
echo [THANH CONG] Da cap nhat code tu GitHub!
echo Chon Option 2 de build giao dien moi.
pause
goto MENU
```
