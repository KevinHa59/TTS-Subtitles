@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Dừng Hoài My Piper TTS

echo ====================================================================
echo             DỪNG TIẾN TRÌNH HOÀI MY PIPER TTS
echo ====================================================================
echo.

set STOPPED=0

:: 1. Dừng theo PID được lưu trong file .server.pid
if exist "%~dp0.server.pid" (
    set /p APP_PID=<"%~dp0.server.pid"
    if defined APP_PID (
        echo Đang dừng tiến trình máy chủ PID !APP_PID!...
        taskkill /f /pid !APP_PID! >nul 2>nul
        if !errorlevel! equ 0 (
            set STOPPED=1
            echo - Đã dừng thành công tiến trình PID !APP_PID!.
        )
    )
    del /f /q "%~dp0.server.pid" >nul 2>nul
)

:: 2. Quét và giải phóng cổng 3000 nếu vẫn đang LISTENING
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000" ^| findstr "LISTENING"') do (
    set PORT_PID=%%a
    if defined PORT_PID (
        echo Phát hiện tiến trình PID !PORT_PID! đang chiếm cổng 3000. Đang đóng...
        taskkill /f /pid !PORT_PID! >nul 2>nul
        if !errorlevel! equ 0 (
            set STOPPED=1
            echo - Đã giải phóng cổng 3000 thành công.
        )
    )
)

echo.
if !STOPPED! equ 1 (
    echo ====================================================================
    echo   ĐÃ DỪNG ỨNG DỤNG HOÀI MY PIPER TTS THÀNH CÔNG!
    echo ====================================================================
) else (
    echo [THÔNG BÁO] Không tìm thấy tiến trình nào đang chạy trên cổng 3000.
)
echo.
timeout /t 3 >nul
