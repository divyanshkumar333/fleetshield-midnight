@echo off
setlocal EnableDelayedExpansion

:: ??? Resolve the repo root from the bat file's own location ?????????????????
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

title FleetShield ? Starting...
echo.
echo  FleetShield ? Brainwave 2026 Midnight Privacy Track
echo  =====================================================
echo.

:: ??? STEP 1: Docker check ????????????????????????????????????????????????????
echo [1/5] Checking Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo.
    echo  ====================================================
    echo   Docker Desktop is NOT running.
    echo.
    echo   FleetShield uses Docker for the Midnight standalone
    echo   proof server. Without it the backend will fall back
    echo   to the built-in ZK service ? the valid + invalid
    echo   ZK demo paths still work in that mode.
    echo.
    echo   Start Docker Desktop, then re-run start.bat for the
    echo   full Midnight experience.
    echo  ====================================================
    echo.
    echo  Continuing in fallback mode...
) else (
    echo  Docker OK.
)
echo.

:: ??? STEP 2: Free ports 4000 and 5173 ???????????????????????????????????????
echo [2/5] Releasing ports 4000 and 5173...
for /f "tokens=5" %%p in ('netstat -aon 2^>nul ^| findstr ":4000 " ^| findstr "LISTENING"') do (
    echo  Stopping PID %%p on port 4000...
    taskkill /PID %%p /F >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -aon 2^>nul ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    echo  Stopping PID %%p on port 5173...
    taskkill /PID %%p /F >nul 2>&1
)
echo  Ports clear.
echo.

:: ??? STEP 3: Start Backend API ???????????????????????????????????????????????
echo [3/5] Starting Backend API on port 4000...
start "FleetShield Backend API" cmd /k "cd /d "%ROOT%\bboard-cli" && title FleetShield Backend (port 4000) && npm run start-api"
echo  Backend window launched.
echo.

:: ??? STEP 4: Start Vite Dashboard ???????????????????????????????????????????
echo [4/5] Starting Dashboard (Vite) on port 5173...
start "FleetShield Dashboard" cmd /k "cd /d "%ROOT%\dashboard" && title FleetShield Dashboard (port 5173) && npm run dev"
echo  Dashboard window launched.
echo.

:: ??? STEP 5: Health-poll then open browser ???????????????????????????????????
echo [5/5] Waiting for backend /health...
set BACKEND_WAIT=0
:WAIT_BACKEND
if %BACKEND_WAIT% geq 90 (
    echo.
    echo  Backend did not respond within 90s. Check the Backend window.
    goto WAIT_FRONTEND
)
powershell -NoProfile -Command "try{$r=Invoke-WebRequest -Uri 'http://localhost:4000/health' -UseBasicParsing -TimeoutSec 2 -EA Stop;if($r.StatusCode -eq 200){exit 0}else{exit 1}}catch{exit 1}" >nul 2>&1
if errorlevel 1 (
    set /a BACKEND_WAIT+=3
    <nul set /p=.
    timeout /t 3 /nobreak >nul
    goto WAIT_BACKEND
)
echo.
echo  Backend ready (http://localhost:4000/health OK).
echo.

:WAIT_FRONTEND
echo  Waiting for Vite on port 5173...
set FRONTEND_WAIT=0
:WAIT_VITE
if %FRONTEND_WAIT% geq 60 (
    echo.
    echo  Vite did not start within 60s. Check the Dashboard window.
    goto OPEN_BROWSER
)
powershell -NoProfile -Command "try{Invoke-WebRequest -Uri 'http://localhost:5173' -UseBasicParsing -TimeoutSec 2 -EA Stop;exit 0}catch{exit 1}" >nul 2>&1
if errorlevel 1 (
    set /a FRONTEND_WAIT+=2
    <nul set /p=.
    timeout /t 2 /nobreak >nul
    goto WAIT_VITE
)
echo.
echo  Dashboard ready (http://localhost:5173 OK).
echo.

:OPEN_BROWSER
echo  Opening FleetShield in the browser...
start "" "http://localhost:5173"
echo.
echo  =====================================================
echo   FleetShield is running!
echo.
echo   Dashboard : http://localhost:5173
echo   API       : http://localhost:4000
echo   Health    : http://localhost:4000/health
echo.
echo   Keep the two terminal windows open while using it.
echo   Run STOP.bat to shut everything down cleanly.
echo  =====================================================
echo.
pause
endlocal
