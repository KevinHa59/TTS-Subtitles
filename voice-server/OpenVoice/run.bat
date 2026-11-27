@echo off
setlocal EnableExtensions
title OpenVoice V2 - Chay nhanh

rem ============================================================
rem  Chay nhanh OpenVoice V2 - KHONG kiem tra/cai dat gi ca.
rem  Dung sau khi da chay setup_and_run.bat thanh cong mot lan.
rem  Muon ep chay bang CPU: bo dong rem o dong "OV_FORCE_CPU" ben duoi.
rem ============================================================

set "ENV_NAME=openvoice"
set "PYTHONUTF8=1"
rem set "OV_FORCE_CPU=1"

set "HERE=%~dp0"
if exist "%HERE%openvoice\api.py" (
    set "ROOT=%HERE:~0,-1%"
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
rem ---------- dong bo app_vi.py: chi chep khi file canh file bat MOI HON ----------
if not exist "%HERE%app_vi.py" goto sync_done
xcopy "%HERE%app_vi.py" "%ROOT%" /D /Y /Q /I >nul 2>&1
:sync_done
if exist "%ROOT%\app_vi.py" goto app_found
echo [LOI] Khong thay app_vi.py trong: %ROOT%
goto fail

:app_found
if exist "%ROOT%\checkpoints_v2\converter\checkpoint.pth" goto ckpt_found
echo [LOI] Thieu checkpoint V2. Hay chay setup_and_run.bat de tai.
goto fail

:ckpt_found
rem ---------- dua moi truong vao PATH (khong dung activate.bat) ----------
set "PATH=%ENVDIR%;%ENVDIR%\Library\mingw-w64\bin;%ENVDIR%\Library\usr\bin;%ENVDIR%\Library\bin;%ENVDIR%\Scripts;%PATH%"
set "CONDA_PREFIX=%ENVDIR%"
set "CONDA_DEFAULT_ENV=%ENV_NAME%"

cd /d "%ROOT%"

echo ============================================================
echo   OpenVoice V2 - dang khoi dong...
echo   Giao dien: http://127.0.0.1:7860  (tu mo trinh duyet sau vai giay)
echo   Nhan Ctrl+C hoac dong cua so nay de dung.
echo ============================================================

rem Mo trinh duyet sau ~10 giay (xoa dong nay neu khong muon tu mo)
start "" /min cmd /c "ping -n 11 127.0.0.1 >nul & start http://127.0.0.1:7860"

python app_vi.py
echo.
echo Ung dung da dung.
pause
endlocal
exit /b 0

:fail
echo.
pause
endlocal
exit /b 1
