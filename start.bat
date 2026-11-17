@echo off
setlocal
cd /d "%~dp0"

echo Starting Mealwise...
echo.

REM ---- Backend (http://127.0.0.1:8000) ----
if not exist "backend\.venv\Scripts\python.exe" (
  echo Creating backend virtual environment...
  python -m venv backend\.venv
  if errorlevel 1 (
    echo Failed to create venv. Is Python installed and on PATH?
    pause
    exit /b 1
  )
)

echo Installing / updating backend dependencies...
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt -q
if errorlevel 1 (
  echo Failed to install backend dependencies.
  pause
  exit /b 1
)

REM ---- Frontend (http://localhost:3000) ----
if not exist "frontend\node_modules" (
  echo Installing frontend dependencies...
  pushd frontend
  call npm install
  if errorlevel 1 (
    echo Failed to install frontend dependencies. Is Node.js / npm on PATH?
    popd
    pause
    exit /b 1
  )
  popd
)

echo.
echo Backend  -> http://127.0.0.1:8000
echo Frontend -> http://localhost:3000
echo Closing a service window stops that service.
echo.

REM vision.py loads project-root .env (ANTHROPIC_API_KEY / ANTHROPIC_MODEL)
start "Mealwise Backend" cmd /k "cd /d "%~dp0backend" && .venv\Scripts\python.exe -m uvicorn main:app --port 8000"
start "Mealwise Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

endlocal
