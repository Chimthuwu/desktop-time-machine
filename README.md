# Desktop Time Machine ⏳

> **A multi-environment retro desktop simulator for Windows 10 & Windows 11.**

Desktop Time Machine transforms your modern Windows computer into a living museum of historically inspired desktop operating systems. Running on top of Windows with a shared modular engine, Desktop Time Machine lets you switch between different computing eras while retaining access to your real files, applications, and hardware.

---

## 🌟 Key Features

### One Engine, Many Desktop Environments
- **Windows 95 (1995)**: Teal desktop (`#008080`), classic Start button and menu, 3D grey beveled window frames, taskbar, system tray clock, and retro applications.
- **Mac OS 8 (1997)**: Classic Macintosh Platinum interface, 50% grey dither pattern, top menu bar with Apple logo, authentic startup chime via Web Audio, Control Strip, window shading, and trash bin.
- **Era Switcher Museum (F8)**: Visual gallery allowing seamless time travel between operating system eras.
- **Real Windows Integration**:
  - Browse real Windows directories and folders from within the retro interface.
  - Open files in your Windows default applications.
  - Launch approved host utilities (`calc.exe`, `notepad.exe`, `mspaint.exe`, `explorer.exe`).
  - Open web links in your modern Windows default browser.

### Preserved Classic Applications (Windows 95)
- **Minesweeper**: Authentic 9×9 grid, timer, flag counter, and smile/dead/cool face reactions.
- **Paint**: Functional drawing canvas with classic retro color palette.
- **Notepad**: Text editor with Courier New typography.
- **Internet Explorer**: Web browsing frame with navigation controls and external browser launcher.
- **Display Properties**: Mystify and Starfield Simulation screen saver canvas previews.
- **DOOM**: Classic js-dos DOOM launcher.
- **Safe Shutdown**: Authentic "It is now safe to turn off your computer" screen with an option to exit cleanly back to Windows.

---

## 🚀 How to Launch the Application

### Prerequisites
- Node.js (v18+)
- Windows 10 or Windows 11

### Quick Start
```powershell
# Navigate to project directory
cd Z:\github\skinsos

# Launch the application
npm start
```

---

## ⌨️ Shortcuts & Controls

| Action | Shortcut / Trigger |
|---|---|
| **Open Era Switcher (Museum)** | Press <kbd>F8</kbd> or <kbd>Ctrl+Shift+T</kbd> |
| **Switch Era (In-Desktop)** | Double-click the ⏳ **Time Machine** desktop icon or Start Menu item |
| **Toggle Fullscreen / Kiosk** | Double-click the taskbar clock / tray area |
| **Window Shading (Mac OS 8)** | Double-click the window title bar |
| **Safe Exit to Windows** | Start > Shut Down > Shut down the computer > Yes |

---

## 🛡️ Security Model

- `contextIsolation: true` and `nodeIntegration: false` enforced.
- Renderer processes never access raw Node.js or child process APIs.
- External program launching is strictly whitelisted.
- Filesystem access is mediated through validated asynchronous IPC channels.

---

## 📚 Documentation
- [Architecture & Process Model](file:///Z:/github/skinsos/docs/ARCHITECTURE.md)
- [Skin Development Guide](file:///Z:/github/skinsos/docs/SKIN_DEVELOPMENT.md)
- [LLM Skin Generation Guide](file:///Z:/github/skinsos/docs/LLM_SKIN_GENERATION.md)
