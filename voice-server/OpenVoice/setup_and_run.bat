@echo off
setlocal EnableExtensions
title OpenVoice V2 - Kiem tra va cai dat

rem ============================================================
rem  OpenVoice V2 + edge-tts + Gradio (Windows 11, Intel Arc)
rem  Kiem tra tung thanh phan, thieu cai nao thi cai cai do.
rem  Dat file nay canh app_vi.py (trong thu muc OpenVoice hoac thu muc cha).
rem ============================================================

set "ENV_NAME=openvoice"
set "PY_VER=3.10"
set "REPO_URL=https://github.com/myshell-ai/OpenVoice/archive/refs/heads/main.zip"
set "FAILED=0"
set "PYTHONUTF8=1"

set "HERE=%~dp0"
if exist "%HERE%openvoice\api.py" (
    set "ROOT=%HERE:~0,-1%"
) else (
    set "ROOT=%HERE%OpenVoice"
)

echo.
echo ============================================================
echo   OpenVoice V2 - kiem tra va cai dat tu dong
echo   Thu muc du an: %ROOT%
echo ============================================================

rem ---------- [1/9] conda ----------
echo.
echo [1/9] Kiem tra conda...
set "CROOT="
call :find_conda
if defined CROOT goto conda_ok

echo   [thieu] Chua co conda. Thu cai Miniconda bang winget...
where winget >nul 2>&1
if errorlevel 1 (
    echo   [LOI] May khong co winget. Hay tu cai Miniconda tai:
    echo         https://docs.conda.io/en/latest/miniconda.html
    goto fail
)
winget install -e --id Anaconda.Miniconda3 --accept-package-agreements --accept-source-agreements
call :find_conda
if defined CROOT goto conda_ok
echo   [LOI] Da cai Miniconda nhung chua tim thay. Hay dong cua so nay, mo lai va chay lai file bat.
goto fail

:conda_ok
set "CPY=%CROOT%\python.exe"
set "CSCRIPT=%CROOT%\Scripts\conda-script.py"
set "PATH=%CROOT%\Library\bin;%CROOT%\Scripts;%PATH%"
echo   [ok] %CROOT%
echo %CROOT%| findstr /C:" " >nul
if not errorlevel 1 echo   [luu y] Duong dan conda co dau cach - se goi conda bang python truc tiep de tranh loi.

rem ---------- [2/9] moi truong conda ----------
echo.
echo [2/9] Kiem tra moi truong conda "%ENV_NAME%"...
set "ENVDIR="
if exist "%CROOT%\envs\%ENV_NAME%\python.exe" set "ENVDIR=%CROOT%\envs\%ENV_NAME%"
if not defined ENVDIR if exist "%USERPROFILE%\.conda\envs\%ENV_NAME%\python.exe" set "ENVDIR=%USERPROFILE%\.conda\envs\%ENV_NAME%"
if defined ENVDIR goto env_exists

set "ENVDIR=%CROOT%\envs\%ENV_NAME%"
echo   [thieu] Dang tao moi truong Python %PY_VER%...
call :conda create -y -p "%ENVDIR%" python=%PY_VER% -c conda-forge --override-channels
if errorlevel 1 (
    echo   [LOI] Khong tao duoc moi truong conda.
    goto fail
)
if not exist "%ENVDIR%\python.exe" (
    echo   [LOI] Tao xong nhung khong thay python.exe trong moi truong.
    goto fail
)
goto env_activate

:env_exists
echo   [ok] Da co moi truong: %ENVDIR%

:env_activate
rem Khong dung activate.bat - tu them moi truong vao PATH
set "PATH=%ENVDIR%;%ENVDIR%\Library\mingw-w64\bin;%ENVDIR%\Library\usr\bin;%ENVDIR%\Library\bin;%ENVDIR%\Scripts;%PATH%"
set "CONDA_PREFIX=%ENVDIR%"
set "CONDA_DEFAULT_ENV=%ENV_NAME%"
python --version
python -c "import sys; print('  Python prefix:', sys.prefix)"

rem ---------- [3/9] ffmpeg ----------
echo.
echo [3/9] Kiem tra FFmpeg...
where ffmpeg >nul 2>&1
if not errorlevel 1 goto ffmpeg_ok
echo   [thieu] Dang cai ffmpeg qua conda-forge...
call :conda install -y -p "%ENVDIR%" -c conda-forge --override-channels ffmpeg
where ffmpeg >nul 2>&1
if errorlevel 1 (
    echo   [LOI] Khong cai duoc ffmpeg.
    goto fail
)
:ffmpeg_ok
echo   [ok] ffmpeg

rem ---------- [4/9] PyTorch XPU ----------
echo.
echo [4/9] Kiem tra PyTorch ban XPU...
python -c "import torch" >nul 2>&1
if errorlevel 1 goto torch_install
python -c "import sys,torch; sys.exit(0 if ('xpu' in torch.__version__ or getattr(torch.version,'xpu',None)) else 1)" >nul 2>&1
if errorlevel 1 goto torch_reinstall
echo   [ok] PyTorch ban XPU da co
goto torch_info

:torch_reinstall
echo   [sai] PyTorch hien tai khong phai ban XPU - go ra de cai lai...
python -m pip uninstall -y torch torchvision torchaudio >nul 2>&1
:torch_install
echo   Dang cai PyTorch XPU - dung luong lon, vui long cho...
python -m pip install torch --index-url https://download.pytorch.org/whl/xpu
if errorlevel 1 (
    echo   [LOI] Khong cai duoc PyTorch XPU.
    goto fail
)

:torch_info
python -c "import torch; ok=torch.xpu.is_available(); print('  PyTorch', torch.__version__); print('  XPU kha dung:', ok); print('  Thiet bi:', torch.xpu.get_device_name(0) if ok else 'khong co')"
python -c "import sys,torch; sys.exit(0 if torch.xpu.is_available() else 1)" >nul 2>&1
if errorlevel 1 (
    echo   [canh bao] Chua thay GPU Intel Arc qua XPU. App se chay bang CPU.
    echo              Hay cap nhat driver Intel Arc moi nhat roi chay lai file nay.
)

rem ---------- [5/9] ma nguon OpenVoice ----------
echo.
echo [5/9] Kiem tra ma nguon OpenVoice...
if exist "%ROOT%\openvoice\api.py" goto repo_ok
echo   [thieu] Dang tai ma nguon OpenVoice tu GitHub...
set "TMPR=%TEMP%\ov_src_%RANDOM%"
mkdir "%TMPR%"
curl.exe -L --fail -o "%TMPR%\src.zip" "%REPO_URL%"
if errorlevel 1 (
    echo   [LOI] Tai ma nguon that bai - kiem tra ket noi mang.
    goto fail
)
tar -xf "%TMPR%\src.zip" -C "%TMPR%"
if not exist "%TMPR%\OpenVoice-main\openvoice\api.py" (
    echo   [LOI] Giai nen ma nguon that bai.
    goto fail
)
xcopy "%TMPR%\OpenVoice-main" "%ROOT%" /E /I /Y /Q >nul
rmdir /S /Q "%TMPR%"

:repo_ok
echo   [ok] %ROOT%
cd /d "%ROOT%"
python -m pip show myshell-openvoice >nul 2>&1
if not errorlevel 1 goto editable_ok
echo   Dang cai OpenVoice o che do editable...
python -m pip install -e . --no-deps
if errorlevel 1 echo   [canh bao] Khong cai duoc editable - van chay duoc tu thu muc du an.
:editable_ok

rem ---------- [6/9] thu vien Python ----------
echo.
echo [6/9] Kiem tra thu vien Python...
python -c "import sys,numpy; sys.exit(0 if numpy.__version__.startswith('1.') else 1)" >nul 2>&1
if not errorlevel 1 goto numpy_ok
echo   [thieu] numpy 1.x - dang cai...
python -m pip install "numpy<2"
:numpy_ok
call :ensure librosa librosa
call :ensure soundfile soundfile
call :ensure pydub pydub
call :ensure edge_tts edge-tts
call :ensure gradio gradio
call :ensure eng_to_ipa eng-to-ipa
call :ensure inflect inflect
call :ensure unidecode unidecode
call :ensure pypinyin pypinyin
call :ensure cn2an cn2an
call :ensure jieba jieba
call :ensure tqdm tqdm

rem ---------- [7/9] checkpoint V2 (chi can converter) ----------
echo.
echo [7/9] Kiem tra checkpoint OpenVoice V2 - converter...
set "CONV_DIR=%ROOT%\checkpoints_v2\converter"
set "HF_BASE=https://huggingface.co/myshell-ai/OpenVoiceV2/resolve/main/converter"
if not exist "%CONV_DIR%" mkdir "%CONV_DIR%"

if exist "%CONV_DIR%\config.json" goto cfg_ok
echo   [thieu] Dang tai config.json...
curl.exe -L --fail --retry 3 -o "%CONV_DIR%\config.json" "%HF_BASE%/config.json"
if errorlevel 1 goto ckpt_fail
:cfg_ok

set "CK_SIZE=0"
if exist "%CONV_DIR%\checkpoint.pth" for %%F in ("%CONV_DIR%\checkpoint.pth") do set "CK_SIZE=%%~zF"
if %CK_SIZE% GTR 100000000 goto ckpt_ok
echo   [thieu] Dang tai checkpoint.pth - khoang 131 MB...
curl.exe -L --fail --retry 3 -o "%CONV_DIR%\checkpoint.pth" "%HF_BASE%/checkpoint.pth"
if errorlevel 1 goto ckpt_fail
set "CK_SIZE=0"
for %%F in ("%CONV_DIR%\checkpoint.pth") do set "CK_SIZE=%%~zF"
if %CK_SIZE% GTR 100000000 goto ckpt_ok

:ckpt_fail
echo   [LOI] Tai checkpoint that bai. Hay tai tay 2 file config.json va checkpoint.pth tu:
echo         https://huggingface.co/myshell-ai/OpenVoiceV2/tree/main/converter
echo         roi dat vao thu muc: %CONV_DIR%
goto fail

:ckpt_ok
echo   [ok] checkpoints_v2\converter

rem ---------- [8/9] app_vi.py ----------
echo.
echo [8/9] Kiem tra app_vi.py...
rem ---------- dong bo app_vi.py: chi chep khi file canh file bat MOI HON ----------
if not exist "%HERE%app_vi.py" goto sync_done
xcopy "%HERE%app_vi.py" "%ROOT%" /D /Y /Q /I >nul 2>&1
:sync_done
if exist "%ROOT%\app_vi.py" goto app_ok
echo   [LOI] Khong thay app_vi.py. Hay dat file do vao: %ROOT%
goto fail
:app_ok
echo   [ok] app_vi.py

rem ---------- [9/9] thu import ----------
echo.
echo [9/9] Kiem tra import OpenVoice...
cd /d "%ROOT%"
set "TRIES=0"
:smoke
python -c "from openvoice.api import ToneColorConverter; import edge_tts, gradio" 2> "%TEMP%\ov_err.txt"
if not errorlevel 1 goto smoke_ok
set "MISSING="
for /f "tokens=2 delims='" %%M in ('findstr /C:"No module named" "%TEMP%\ov_err.txt"') do set "MISSING=%%M"
if not defined MISSING goto smoke_fail
set /a TRIES+=1
if %TRIES% GTR 8 goto smoke_fail
echo   [thieu] module %MISSING% - dang cai...
python -m pip install %MISSING%
goto smoke
:smoke_fail
echo   [LOI] Khong import duoc OpenVoice. Chi tiet:
type "%TEMP%\ov_err.txt"
goto fail
:smoke_ok
echo   [ok] Import thanh cong

rem ---------- chay ung dung ----------
echo.
echo ============================================================
echo   Moi thu da san sang. Dang khoi dong giao dien Gradio...
echo   Mo trinh duyet tai: http://127.0.0.1:7860
echo   Nhan Ctrl+C trong cua so nay de dung.
echo ============================================================
if not "%FAILED%"=="0" echo   [canh bao] Co %FAILED% goi cai khong thanh cong - xem thong bao o tren.
python app_vi.py
pause
endlocal
exit /b 0


rem ============================================================
rem  Subroutines
rem ============================================================

:find_conda
if defined CROOT exit /b 0
if defined CONDA_EXE if exist "%CONDA_EXE%" for %%I in ("%CONDA_EXE%\..\..") do if exist "%%~fI\Scripts\conda.exe" set "CROOT=%%~fI"
for %%D in ("C:\miniconda3" "C:\anaconda3" "%USERPROFILE%\miniconda3" "%USERPROFILE%\anaconda3" "%LOCALAPPDATA%\miniconda3" "%LOCALAPPDATA%\anaconda3" "%ProgramData%\miniconda3" "%ProgramData%\anaconda3") do if not defined CROOT if exist "%%~D\Scripts\conda.exe" set "CROOT=%%~D"
exit /b 0

:conda
if not exist "%CSCRIPT%" goto conda_exe
"%CPY%" "%CSCRIPT%" %*
exit /b %errorlevel%
:conda_exe
"%CROOT%\Scripts\conda.exe" %*
exit /b %errorlevel%

:ensure
python -c "import %~1" >nul 2>&1
if not errorlevel 1 (
    echo   [ok] %~1
    exit /b 0
)
echo   [thieu] %~1 - dang cai...
python -m pip install %~2
if errorlevel 1 (
    echo   [LOI] Khong cai duoc %~2
    set /a FAILED+=1
)
exit /b 0

:fail
echo.
echo ============================================================
echo   Cai dat chua hoan tat. Xem thong bao loi o tren.
echo ============================================================
pause
exit /b 1
