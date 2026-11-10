@echo off
setlocal
title TTS-Subtitles - Whisper Vulkan prerequisites

fltmc >nul 2>&1
if not errorlevel 1 goto ADMIN

echo Administrator permission is required to install Visual Studio C++ Build Tools,
echo CMake and the Vulkan SDK.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
if errorlevel 1 goto UAC_ERROR
exit /b 0

:ADMIN
echo ============================================================
echo Installing prerequisites for Whisper Vulkan GPU acceleration
echo ============================================================
echo.

where winget >nul 2>&1
if errorlevel 1 goto NO_WINGET

echo [1/3] Installing Visual Studio 2022 C++ Build Tools...
winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --scope machine --accept-package-agreements --accept-source-agreements --override "--wait --passive --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
if errorlevel 1 goto INSTALL_ERROR

echo.
echo [2/3] Installing CMake...
winget install --id Kitware.CMake --exact --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto INSTALL_ERROR

echo.
echo [3/3] Installing the Vulkan SDK...
winget install --id KhronosGroup.VulkanSDK --exact --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto INSTALL_ERROR

echo.
echo ============================================================
echo Prerequisites installed successfully.
echo Restart TTS-Subtitles, then open Voice Clone and select
echo "Build Whisper Vulkan (GPU)" to build the GPU-enabled backend.
echo ============================================================
goto DONE

:NO_WINGET
echo [ERROR] winget was not found. Install or update App Installer from Microsoft Store,
echo then run this installer again.
goto DONE

:INSTALL_ERROR
echo.
echo [ERROR] An installation failed. Review the winget output above,
echo then rerun this installer after resolving the reported issue.
goto DONE

:UAC_ERROR
echo [ERROR] Could not request Administrator permission.

:DONE
echo.
pause
