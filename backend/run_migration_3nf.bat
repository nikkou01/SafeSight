@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_PATH=%SCRIPT_DIR%migrate_collisions_3nf.py"

if not exist "%SCRIPT_PATH%" (
  echo ERROR: Could not find %SCRIPT_PATH%
  exit /b 1
)

set "PY_CMD=python"
where python >nul 2>nul
if errorlevel 1 (
  where py >nul 2>nul
  if errorlevel 1 (
    echo ERROR: Python not found in PATH.
    exit /b 1
  ) else (
    set "PY_CMD=py -3"
  )
)

if "%~1"=="" (
  echo Running migration with --apply --keep-legacy.
  %PY_CMD% "%SCRIPT_PATH%" --apply --keep-legacy
) else (
  %PY_CMD% "%SCRIPT_PATH%" %*
)

endlocal
