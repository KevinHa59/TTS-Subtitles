@echo off
chcp 65001 >nul
setlocal
title Cai dat Hoai My Piper TTS

cd /d "%~dp0"
if errorlevel 1 goto ERROR_DIR

echo ============================================================
echo       CAI DAT BAN DAU - HOAI MY PIPER TTS
echo ============================================================
echo.
echo Thu muc ung dung: %CD%
echo.

echo [1/4] Kiem tra Node.js...
where node >nul 2>&1
if errorlevel 1 goto NO_NODE

node -v
where npm >nul 2>&1
if errorlevel 1 goto NO_NPM

echo.
echo [2/4] Kiem tra FFmpeg...
where ffmpeg >nul 2>&1
if not errorlevel 1 goto FFMPEG_OK

if exist "%~dp0ffmpeg.exe" goto FFMPEG_LOCAL

echo [CANH BAO] Chua tim thay FFmpeg.
echo Neu khong co FFmpeg, chuc nang chinh toc do va xu ly audio
echo co the that bai. Hay cai dat FFmpeg truoc khi su dung.
echo Tham khao: https://www.gyan.dev/ffmpeg/builds/
goto FFMPEG_DONE

:FFMPEG_LOCAL
echo Da tim thay ffmpeg.exe trong thu muc ung dung.
goto FFMPEG_DONE

:FFMPEG_OK
echo Da tim thay FFmpeg trong PATH.

:FFMPEG_DONE
echo.
echo [3/4] Cai dat cac thu vien npm...
call npm install
if errorlevel 1 goto NPM_ERROR

echo.
echo [4/4] Build frontend...
call npm run build
if errorlevel 1 goto BUILD_ERROR

echo.
echo ============================================================
echo              THIET LAP THANH CONG!
echo ============================================================
echo Hay chay Start-App.bat de khoi dong ung dung.
echo.
goto END

:NO_NODE
echo.
echo [LOI] Chua cai dat Node.js hoac Node.js khong nam trong PATH.
echo Tai tai: https://nodejs.org/
goto END

:NO_NPM
echo.
echo [LOI] Khong tim thay npm. Hay kiem tra lai cai dat Node.js.
goto END

:ERROR_DIR
echo [LOI] Khong the truy cap thu muc chua Setup.bat.
goto END

:NPM_ERROR
echo.
echo [LOI] npm install that bai.
echo Hay kiem tra ket noi mang va thong bao loi phia tren.
goto END

:BUILD_ERROR
echo.
echo [LOI] npm run build that bai.
echo Hay kiem tra thong bao loi phia tren.
goto END

:END
echo.
echo Qua trinh da ket thuc. Nhan phim bat ky de dong cua so.
pause >nul
endlocal
