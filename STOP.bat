@echo off
setlocal EnableDelayedExpansion

title FleetShield ? Stopping...
echo.
echo  FleetShield ? Stop
echo  ==================
echo.

echo  Stopping processes on port 4000 (Backend API)...
set FOUND4000=0
for /f "tokens=5" %%p in ('netstat -aon 2^>nul ^| findstr ":4000 " ^| findstr "LISTENING"') do (
    echo  Stopping PID %%p...
    taskkill /PID %%p /F >nul 2>&1
    set FOUND4000=1
)
if "!FOUND4000!"=="0" echo  Nothing running on port 4000.

echo.
echo  Stopping processes on port 5173 (Vite Dashboard)...
set FOUND5173=0
for /f "tokens=5" %%p in ('netstat -aon 2^>nul ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    echo  Stopping PID %%p...
    taskkill /PID %%p /F >nul 2>&1
    set FOUND5173=1
)
if "!FOUND5173!"=="0" echo  Nothing running on port 5173.

echo.
echo  FleetShield stopped.
echo  (Unrelated Node and Docker processes are NOT affected.)
echo.
pause
endlocal
