@echo off
REM My Passwords Ver-0.004 cleanup
REM Removes the old Netlify Database migrations folder after switching to Supabase.
if exist "netlify\database" (
  rmdir /s /q "netlify\database"
  echo Removed old netlify\database folder.
) else (
  echo No netlify\database folder found.
)
