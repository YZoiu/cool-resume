@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Cool Resume - Tauri 预览
cd /d "%~dp0"

echo ============================================
echo  Cool Resume  Tauri 预览 (Vite HMR)
echo ============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Node.js。请先安装 Node 20.19+ 或 22.12+。
  echo        https://nodejs.org/
  pause
  exit /b 1
)

where cargo >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Rust/Cargo。桌面预览需要 Rust 工具链。
  echo        https://rustup.rs/
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [信息] 首次运行，正在安装 npm 依赖...
  call npm ci
  if errorlevel 1 (
    echo [错误] npm ci 失败。
    pause
    exit /b 1
  )
  echo.
)

if not exist "data\catalog.json" (
  echo [信息] 正在从示例初始化本地简历数据...
  call npm run init
  if errorlevel 1 (
    echo [错误] npm run init 失败。
    pause
    exit /b 1
  )
  echo.
)

echo [信息] 清理旧的预览进程 / 60090 端口...
taskkill /F /IM cool-resume.exe >nul 2>&1
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 60090 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo [信息] 正在启动 Tauri 桌面窗口。
echo [信息] 修改 src/ 下的 JS/CSS 会自动热更新；关闭本窗口或 Ctrl+C 退出。
echo.

call npm run tauri:dev
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
  echo [错误] Tauri 预览已退出，错误码 %EXITCODE%。
  pause
)
exit /b %EXITCODE%
