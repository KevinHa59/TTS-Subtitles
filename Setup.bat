@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Cài đặt Hoài My Piper TTS

echo ====================================================================
echo          CÀI ĐẶT & THIẾT LẬP BAN ĐẦU - HOÀI MY PIPER TTS
echo ====================================================================
echo.

:: 1. Kiểm tra Node.js
echo [1/4] Đang kiểm tra Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [LỖI] Chưa cài đặt Node.js trên máy tính!
    echo Vui lòng tải và cài đặt Node.js (khuyến nghị phiên bản LTS 20 trở lên) tại:
    echo   https://nodejs.org/
    echo Sau khi cài đặt Node.js xong, hãy mở lại file Setup.bat này.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VERSION=%%v
echo       - Đã phát hiện Node.js: !NODE_VERSION!

:: 2. Kiểm tra FFmpeg
echo.
echo [2/4] Đang kiểm tra FFmpeg (xử lý âm thanh & tốc độ đọc)...
where ffmpeg >nul 2>nul
if %errorlevel% equ 0 (
    for /f "tokens=*" %%f in ('ffmpeg -version 2^>nul ^| findstr /i "ffmpeg version"') do set FFMPEG_VER=%%f
    echo       - Đã phát hiện FFmpeg trong hệ thống: !FFMPEG_VER!
) else if exist "%~dp0ffmpeg.exe" (
    echo       - Đã tìm thấy ffmpeg.exe trong thư mục ứng dụng.
) else (
    echo       [LƯU Ý] Chưa tìm thấy FFmpeg trong hệ thống (PATH hoặc ffmpeg.exe).
    echo       Để hỗ trợ xuất file MP3 và điều chỉnh tốc độ đọc (atempo), bạn có thể:
    echo       - Cài đặt bằng Windows Package Manager: winget install Gyan.FFmpeg
    echo       - Hoặc tải ffmpeg từ https://www.gyan.dev/ffmpeg/builds/ và chép ffmpeg.exe vào thư mục này.
)

:: 3. Cài đặt các thư viện npm
echo.
echo [3/4] Đang cài đặt thư viện phụ thuộc (npm install)...
call npm install
if %errorlevel% neq 0 (
    echo [LỖI] Quá trình npm install thất bại! Vui lòng kiểm tra lại kết nối mạng.
    pause
    exit /b 1
)
echo       - Cài đặt thư viện hoàn tất.

:: 4. Build giao diện frontend
echo.
echo [4/4] Đang biên dịch frontend (npm run build)...
call npm run build
if %errorlevel% neq 0 (
    echo [LỖI] Quá trình biên dịch frontend thất bại!
    pause
    exit /b 1
)
echo       - Đã biên dịch frontend vào thư mục dist thành công.

echo.
echo ====================================================================
echo                   THIẾT LẬP THÀNH CÔNG!
echo ====================================================================
echo Bây giờ bạn chỉ cần nhấp đúp vào file "Start-App.bat" để khởi chạy
echo ứng dụng và trình duyệt sẽ tự động mở trang web http://localhost:3000.
echo.
pause
