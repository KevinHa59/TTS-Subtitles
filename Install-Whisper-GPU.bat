@echo off
setlocal EnableExtensions EnableDelayedExpansion
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

echo [1/3] Checking Visual Studio 2022 C++ Build Tools...
call :CHECK_VISUAL_STUDIO
if "!VS_FOUND!"=="1" (
  echo Visual Studio C++ Build Tools already installed. Skipping.
) else if "!VS_MODIFY!"=="1" (
  echo Visual Studio is installed without the required C++ workload. Adding it...
  set "VS_INSTALLER=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\setup.exe"
  if not exist "!VS_INSTALLER!" goto INSTALL_ERROR
  "!VS_INSTALLER!" modify --installPath "!VS_INSTALL_PATH!" --add Microsoft.VisualStudio.Workload.VCTools --passive --norestart
  if errorlevel 1 goto INSTALL_ERROR
  call :CHECK_VISUAL_STUDIO
  if "!VS_FOUND!"=="0" goto VERIFY_ERROR
) else (
  echo Installing Visual Studio 2022 C++ Build Tools...
  winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --scope machine --accept-package-agreements --accept-source-agreements --override "--wait --passive --norestart --add Microsoft.VisualStudio.Workload.VCTools"
  if errorlevel 1 goto INSTALL_ERROR
  call :CHECK_VISUAL_STUDIO
  if "!VS_FOUND!"=="0" goto VERIFY_ERROR
)

echo.
echo [2/3] Checking CMake...
call :CHECK_CMAKE
if "!CMAKE_FOUND!"=="1" (
  echo CMake already installed. Skipping.
) else (
  echo Installing CMake...
  winget install --id Kitware.CMake --exact --accept-package-agreements --accept-source-agreements
  if errorlevel 1 goto INSTALL_ERROR
  call :CHECK_CMAKE
  if "!CMAKE_FOUND!"=="0" goto VERIFY_ERROR
)

echo.
echo [3/3] Checking the Vulkan SDK...
call :CHECK_VULKAN_SDK
if "!VULKAN_FOUND!"=="1" (
  echo Vulkan SDK already installed. Skipping.
) else (
  echo Installing the Vulkan SDK...
  winget install --id KhronosGroup.VulkanSDK --exact --accept-package-agreements --accept-source-agreements
  if errorlevel 1 goto INSTALL_ERROR
  call :CHECK_VULKAN_SDK
  if "!VULKAN_FOUND!"=="0" goto VERIFY_ERROR
)

echo.
echo ============================================================
echo All Whisper Vulkan prerequisites are installed.
echo Restart TTS-Subtitles, then open Voice Clone and select
echo "Build Whisper Vulkan (GPU)" to build the GPU-enabled backend.
echo ============================================================
goto DONE

:CHECK_VISUAL_STUDIO
set "VS_FOUND=0"
set "VS_MODIFY=0"
set "VS_INSTALL_PATH="
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "!VSWHERE!" exit /b 0
for /f "usebackq tokens=*" %%I in (`"!VSWHERE!" -latest -products * -property installationPath`) do set "VS_INSTALL_PATH=%%I"
if not defined VS_INSTALL_PATH exit /b 0
set "VS_CPP_PATH="
for /f "usebackq tokens=*" %%I in (`"!VSWHERE!" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VS_CPP_PATH=%%I"
if defined VS_CPP_PATH if exist "!VS_CPP_PATH!\VC\Auxiliary\Build\vcvars64.bat" set "VS_FOUND=1"
if "!VS_FOUND!"=="0" set "VS_MODIFY=1"
exit /b 0

:CHECK_CMAKE
set "CMAKE_FOUND=0"
where cmake >nul 2>&1
if not errorlevel 1 set "CMAKE_FOUND=1"
if exist "%ProgramFiles%\CMake\bin\cmake.exe" set "CMAKE_FOUND=1"
exit /b 0

:CHECK_VULKAN_SDK
set "VULKAN_FOUND=0"
if defined VULKAN_SDK (
  if exist "%VULKAN_SDK%\Include\vulkan\vulkan.h" if exist "%VULKAN_SDK%\Lib\vulkan-1.lib" set "VULKAN_FOUND=1"
)
for /d %%D in ("%ProgramFiles%\VulkanSDK\*") do (
  if exist "%%~D\Include\vulkan\vulkan.h" if exist "%%~D\Lib\vulkan-1.lib" set "VULKAN_FOUND=1"
)
for /d %%D in ("C:\VulkanSDK\*") do (
  if exist "%%~D\Include\vulkan\vulkan.h" if exist "%%~D\Lib\vulkan-1.lib" set "VULKAN_FOUND=1"
)
exit /b 0

:VERIFY_ERROR
echo.
echo [ERROR] winget finished, but a required component could not be verified.
echo Restart Windows if an installer requested it, then run this installer again.
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
