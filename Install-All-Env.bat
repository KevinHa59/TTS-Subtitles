@echo off
chcp 65001 >nul
setlocal
title TTS-Subtitles - Install All Environments

cd /d "%~dp0"
if errorlevel 1 goto ERROR_DIR

echo ============================================================
echo       TTS-SUBTITLES - INSTALL ALL ENVIRONMENTS
echo ============================================================
echo.
echo This installs app and optional Python dependencies.
echo Model weights are NOT downloaded by this script.
echo Python packages can require several gigabytes of disk space.
echo.
pause

echo.
echo [1/7] Checking Node.js and npm...
where node >nul 2>&1
if errorlevel 1 goto NO_NODE
where npm >nul 2>&1
if errorlevel 1 goto NO_NPM
node -v
call npm install
if errorlevel 1 goto NPM_ERROR
call npm run build
if errorlevel 1 goto BUILD_ERROR

echo.
echo [2/7] Finding Python 3.10, 3.11 or 3.12...
set "PYTHON_LAUNCHER="
py -3.10 --version >nul 2>&1
if not errorlevel 1 set "PYTHON_LAUNCHER=py -3.10"
if defined PYTHON_LAUNCHER goto PYTHON_FOUND
py -3.11 --version >nul 2>&1
if not errorlevel 1 set "PYTHON_LAUNCHER=py -3.11"
if defined PYTHON_LAUNCHER goto PYTHON_FOUND
py -3.12 --version >nul 2>&1
if not errorlevel 1 set "PYTHON_LAUNCHER=py -3.12"
if defined PYTHON_LAUNCHER goto PYTHON_FOUND
python --version >nul 2>&1
if not errorlevel 1 set "PYTHON_LAUNCHER=python"
if defined PYTHON_LAUNCHER goto PYTHON_FOUND
goto NO_PYTHON

:PYTHON_FOUND
echo Using %PYTHON_LAUNCHER%
call %PYTHON_LAUNCHER% -c "import struct,sys; print(sys.version); sys.exit(0 if sys.version_info[:2] in ((3,10),(3,11),(3,12)) and struct.calcsize('P')==8 else 1)"
if errorlevel 1 goto NO_PYTHON

echo.
echo [3/7] Installing background-music environment...
call %PYTHON_LAUNCHER% -m venv "%~dp0.venv-bgm"
if errorlevel 1 goto VENV_ERROR
"%~dp0.venv-bgm\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto PIP_ERROR
"%~dp0.venv-bgm\Scripts\python.exe" -m pip install -r "%~dp0requirements-bgm.txt"
if errorlevel 1 goto BGM_ERROR
"%~dp0.venv-bgm\Scripts\python.exe" -m pip check
if errorlevel 1 goto BGM_ERROR

echo.
echo [4/7] Installing Video Dubbing separation environment...
call %PYTHON_LAUNCHER% -m venv "%~dp0.venv-video-dubbing"
if errorlevel 1 goto VENV_ERROR
"%~dp0.venv-video-dubbing\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto PIP_ERROR
"%~dp0.venv-video-dubbing\Scripts\python.exe" -m pip install -r "%~dp0requirements-video-dubbing-mdx.txt"
if errorlevel 1 goto MDX_ERROR
"%~dp0.venv-video-dubbing\Scripts\python.exe" -m pip check
if errorlevel 1 goto MDX_ERROR

echo.
echo [5/7] Installing VieNeu-TTS environment...
call %PYTHON_LAUNCHER% -m venv "%~dp0.venv-vieneu"
if errorlevel 1 goto VENV_ERROR
"%~dp0.venv-vieneu\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto PIP_ERROR
"%~dp0.venv-vieneu\Scripts\python.exe" -m pip install vieneu
if errorlevel 1 goto VIENEU_ERROR
"%~dp0.venv-vieneu\Scripts\python.exe" -m pip check
if errorlevel 1 goto VIENEU_ERROR

echo.
echo [6/7] Installing the app-managed OCR Python environment...
set "OCR_ROOT=%LOCALAPPDATA%\PiperTTSStudio\subtitle-ocr"
set "OCR_VENV=%OCR_ROOT%\runtime"
if not exist "%OCR_ROOT%" mkdir "%OCR_ROOT%"
if errorlevel 1 goto OCR_ERROR
call %PYTHON_LAUNCHER% -m venv "%OCR_VENV%"
if errorlevel 1 goto VENV_ERROR
"%OCR_VENV%\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto PIP_ERROR
"%OCR_VENV%\Scripts\python.exe" -m pip install paddlepaddle==3.3.1 paddleocr==3.7.0 opencc-python-reimplemented==0.1.7
if errorlevel 1 goto OCR_ERROR
"%OCR_VENV%\Scripts\python.exe" -c "import paddle,paddleocr; from opencc import OpenCC; print('OCR runtime ready:', paddle.__version__)"
if errorlevel 1 goto OCR_ERROR
> "%OCR_ROOT%\runtime-ready.json" echo {"schema":2,"paddlepaddle":"3.3.1","paddleocr":"3.7.0","opencc":"0.1.7"}

echo.
echo [7/7] Checking FFmpeg/FFprobe and eSpeak NG...
where ffmpeg >nul 2>&1
if errorlevel 1 (
    echo [WARNING] FFmpeg was not found in PATH. Install it to enable audio/video processing.
) else (
    echo FFmpeg found.
)
where ffprobe >nul 2>&1
if errorlevel 1 echo [WARNING] FFprobe was not found in PATH.
where espeak-ng >nul 2>&1
if errorlevel 1 (
    if not exist "%ProgramFiles%\eSpeak NG\espeak-ng.exe" echo [WARNING] eSpeak NG was not found. Install it for Vietnamese Piper pronunciation.
) else (
    echo eSpeak NG found.
)

echo.
echo ============================================================
echo       ENVIRONMENTS INSTALLED SUCCESSFULLY
echo ============================================================
echo.
echo Installed environments:
echo   .venv-bgm
echo   .venv-video-dubbing
echo   .venv-vieneu
echo   %%LOCALAPPDATA%%\PiperTTSStudio\subtitle-ocr\runtime
echo.
echo Whisper and subtitle-translation engine can be installed from
echo their management pages in the application.
echo OCR models, Whisper models, TTS voices and AI weights must be
echo downloaded separately. See README-LOCAL.md for model details.
echo.
echo FFmpeg/FFprobe and eSpeak NG are system dependencies. Install
echo them separately if they are not already available in PATH.
echo.
pause
exit /b 0

:ERROR_DIR
echo [ERROR] Cannot access the folder containing this installer.
goto FAILED
:NO_NODE
echo [ERROR] Node.js is not installed or is not available in PATH.
echo Install the current Node.js LTS release, then run this installer again.
goto FAILED
:NO_NPM
echo [ERROR] npm is not available. Repair the Node.js installation.
goto FAILED
:NO_PYTHON
echo [ERROR] Python 3.10, 3.11 or 3.12 was not found.
echo Install Python 3.10-3.12 (64-bit) and enable the Python launcher.
goto FAILED
:NPM_ERROR
echo [ERROR] npm install failed.
goto FAILED
:BUILD_ERROR
echo [ERROR] Frontend build failed.
goto FAILED
:VENV_ERROR
echo [ERROR] Could not create a Python virtual environment.
goto FAILED
:PIP_ERROR
echo [ERROR] Could not upgrade pip in one of the environments.
goto FAILED
:BGM_ERROR
echo [ERROR] Background-music dependencies failed. Check the pip output.
goto FAILED
:MDX_ERROR
echo [ERROR] Video Dubbing dependencies failed. Check the pip output.
goto FAILED
:VIENEU_ERROR
echo [ERROR] VieNeu-TTS dependencies failed. Check the pip output.
goto FAILED
:OCR_ERROR
echo [ERROR] OCR runtime dependencies failed. Check the pip output.
goto FAILED

:FAILED
echo.
echo Installation did not complete. Fix the reported issue and run again.
pause
exit /b 1
