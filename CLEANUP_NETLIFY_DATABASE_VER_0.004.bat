@echo off
echo ============================================================
echo My Passwords Ver-0.004 cleanup
echo Removing old Netlify Database migration folder from this project
echo because Ver-0.004 now uses Supabase as the cloud database layer.
echo ============================================================
if exist "netlify\database" (
  rmdir /s /q "netlify\database"
  echo Removed netlify\database
) else (
  echo netlify\database was not present. Nothing to remove.
)
echo.
echo Keep the Netlify hosting project and functions. Only the old Netlify Database migration folder is removed.
pause
