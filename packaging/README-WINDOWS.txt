Barehands (New Engine) 1.1.0 - Windows

WHAT YOU NEED
  Python 3 from https://www.python.org/downloads/
  Tick "Add python.exe to PATH" during Python setup. Nothing else;
  the app uses only the Python standard library.

INSTALL
  1. Unzip this folder anywhere.
  2. Right-click install.ps1 and choose "Run with PowerShell".
     (If Windows blocks it: open PowerShell in this folder and run
      powershell -ExecutionPolicy Bypass -File .\install.ps1 )
  3. Launch "Barehands (New Engine)" from the Start Menu or Desktop.

The app copies itself to %LOCALAPPDATA%\BarehandsNew, starts a small
local server, and opens the board in your browser at
http://127.0.0.1:8794/stage.html - allow camera access there.

Your config and board state live in the app folder (barehands.json
and the state folder) and survive reinstalls.

UNINSTALL
  Run uninstall.ps1 the same way.
