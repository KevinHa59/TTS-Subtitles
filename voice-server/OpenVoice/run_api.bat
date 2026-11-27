@echo off
setlocal EnableExtensions
title OpenVoice V2 - API server

rem ============================================================
rem  Chay API server OpenVoice (FastAPI) cho webapp Vite.
rem  Dung sau khi da chay setup_and_run.bat thanh cong mot lan.
rem  Tham so: --no-pause  (khong cho nhan phim khi ket thuc, dung voi npm scripts)
rem ============================================================

set "ENV_NAME=openvoice"
set "API_HOST=127.0.0.1"
set "API_PORT=8000"
set "PYTHONUTF8=1"
rem set "OV_FORCE_CPU=1"
rem set "ALLOW_ORIGINS=https://ten-mien-cua-ban.com"
rem set "STATIC_DIR=..\dist"

set "NOPAUSE=0"
if /i "%~1"=="--no-pause" set "NOPAUSE=1"

rem ---------- tim thu muc OpenVoice ----------
set "HERE=%~dp0"
if exist "%HERE%openvoice\api.py" (
    set "ROOT=%HERE:~0,-1%"
) else if exist "%HERE%voice-server\openvoice\api.py" (
    set "ROOT=%HERE%voice-server"
) else (
    set "ROOT=%HERE%OpenVoice"
)

rem ---------- tim moi truong conda ----------
set "ENVDIR="
for %%D in ("C:\miniconda3" "C:\anaconda3" "%USERPROFILE%\miniconda3" "%USERPROFILE%\anaconda3" "%LOCALAPPDATA%\miniconda3" "%LOCALAPPDATA%\anaconda3" "%ProgramData%\miniconda3" "%ProgramData%\anaconda3" "%USERPROFILE%\.conda") do if not defined ENVDIR if exist "%%~D\envs\%ENV_NAME%\python.exe" set "ENVDIR=%%~D\envs\%ENV_NAME%"
if defined ENVDIR goto env_found
echo [LOI] Khong tim thay moi truong "%ENV_NAME%". Hay chay setup_and_run.bat truoc.
goto fail

:env_found
if exist "%ROOT%\openvoice\api.py" goto root_found
echo [LOI] Khong thay thu muc OpenVoice: %ROOT%
goto fail

:root_found
rem ---------- dong bo file Python tu thu muc chua file bat (neu khac) ----------
call :sync_file app_vi.py
call :sync_file api_server.py

if exist "%ROOT%\api_server.py" goto api_found
echo [LOI] Khong thay api_server.py. Hay dat api_server.py canh file bat nay.
goto fail

:api_found
if exist "%ROOT%\checkpoints_v2\converter\checkpoint.pth" goto ckpt_found
echo [LOI] Thieu checkpoint V2. Hay chay setup_and_run.bat de tai.
goto fail

:ckpt_found
set "PATH=%ENVDIR%;%ENVDIR%\Library\mingw-w64\bin;%ENVDIR%\Library\usr\bin;%ENVDIR%\Library\bin;%ENVDIR%\Scripts;%PATH%"
set "CONDA_PREFIX=%ENVDIR%"
set "CONDA_DEFAULT_ENV=%ENV_NAME%"

cd /d "%ROOT%"

echo ============================================================
echo   OpenVoice API - dang khoi dong...
echo   Dia chi: http://%API_HOST%:%API_PORT%/api/health
echo   Nhan Ctrl+C hoac dong cua so nay de dung.
echo ============================================================

python -m uvicorn api_server:app --host %API_HOST% --port %API_PORT%
echo.
echo API server da dung.
if "%NOPAUSE%"=="0" pause
endlocal
exit /b 0

:fail
echo.
if "%NOPAUSE%"=="0" pause
endlocal
exit /b 1

:sync_file
rem Chi chep khi file canh file bat MOI HON file trong thu muc OpenVoice
if not exist "%HERE%%~1" exit /b 0
xcopy "%HERE%%~1" "%ROOT%" /D /Y /Q /I >nul 2>&1
exit /b 0
