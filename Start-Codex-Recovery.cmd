@echo off
pwsh -NoLogo -NoProfile -File "%~dp0scripts\recover-codex.ps1" %*
if errorlevel 1 (
  echo.
  echo Recovery did not complete. Read the message above before retrying.
  pause
  exit /b 1
)
