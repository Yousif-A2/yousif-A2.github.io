@echo off
echo Starting AI Agent Portfolio...

:: Start Server in a new window
start "Server" cmd /c "cd server && npm run dev"

:: Start Client in a new window
start "Client" cmd /c "cd client && npm run dev"

echo Services started! 
echo Server running on http://localhost:3001
echo Client running on http://localhost:5173
echo.
echo If windows close immediately, check for errors.
pause
