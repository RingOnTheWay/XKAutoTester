@echo off

REM Set console encoding to UTF-8
chcp 65001 >nul

REM Set environment variables for UTF-8 support
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1

echo ========================================
echo    XKAutoTester Electron Startup Script
echo ========================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not detected. Please install Node.js first.
    echo Download: https://nodejs.org/
    pause
    exit /b 1
)

REM Check if running in project root directory
if not exist "electron\package.json" (
    echo ERROR: Please run this script from project root directory.
    pause
    exit /b 1
)

REM Change to electron directory
cd electron

REM Check if dependencies are installed
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    if errorlevel 1 (
        echo ERROR: Dependency installation failed.
        pause
        exit /b 1
    )
    echo Dependencies installed successfully.
)

echo Starting XKAutoTester Electron application...
echo.

REM Start Electron application
npm start

pause