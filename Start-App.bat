@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Hoài My Piper TTS Server

echo ====================================================================
echo             KHỞI ĐỘNG HOÀI MY PIPER TTS (LOCAL PRODUCTION)
echo ====================================================================
echo.

:: 1. Kiểm tra node_modules
if not exist "%~dp0node_modules" (
    echo [CẢNH BÁO] Chưa tìm thấy thư mục node_modules.
    echo Đang tự động chạy Setup.bat để chuẩn bị môi trường...
    echo.
    call "%~dp0Setup.bat"
)

:: 2. Kiểm tra dist
if not exist "%~dp0dist" (
    echo [CẢNH BÁO] Chưa tìm thấy bản build frontend trong thư mục dist.
    echo Đang thực hiện build frontend...
    echo.
    call npm run build
)

:: 3. Kiểm tra xem cổng 3000 có đang bị chiếm dụng không
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000" ^| findstr "LISTENING"') do (
    set OCCUPIED_PID=%%a
    if defined OCCUPIED_PID (
        echo [THÔNG BÁO] Phát hiện tiến trình PID !OCCUPIED_PID! đang chạy trên cổng 3000.
        echo Đang tự động giải phóng cổng 3000 để khởi động lại...
        taskkill /f /pid !OCCUPIED_PID! >nul 2>nul
        timeout /t 1 >nul
    )
)

:: 4. Thiết lập biến môi trường
set NODE_ENV=production
set PORT=3000
set PIPER_ESPEAK_BRIDGE=0
set OPEN_BROWSER=1

:: Tự động nhận diện eSpeak NG để phát âm chuẩn tiếng Việt có dấu
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

echo Đang khởi động máy chủ local...
echo Trình duyệt web sẽ tự động mở tại: http://localhost:3000
echo.
echo (Nhấp đúp "Stop-App.bat" hoặc đóng cửa sổ này khi muốn dừng ứng dụng)
echo.

:: 5. Chạy ứng dụng production
call npm start

if %errorlevel% neq 0 (
    echo.
    echo [LỖI] Máy chủ đã dừng hoặc gặp lỗi trong quá trình thực thi!
    pause
)
