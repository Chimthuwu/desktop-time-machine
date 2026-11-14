/**
 * Focused smoke test for the Phase 4 real-desktop mirror across all three skins.
 * Uses localStorage + reload to select each skin (avoids switchSkin hang).
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { registerIpcHandlers } = require(path.join(__dirname, '../electron/main/ipc-handlers'));

const out = {};
app.commandLine.appendSwitch('mute-audio');
const SKINS = ['windows95', 'windows98', 'macos8'];
let finished = false;

process.on('unhandledRejection', (e) => { out.unhandledRejection = (e && e.message) || String(e); finish(); });

function finish() {
  if (finished) return;
  finished = true;
  console.log('=== MIRROR SMOKE RESULTS (all skins) ===');
  console.log(JSON.stringify(out, null, 2));
  app.quit();
}
setTimeout(finish, 120000).unref();

async function loadSkin(win, name) {
  // Always persist the target skin and reload — trusting the remembered skin
  // for windows95 inspected whatever was selected by a previous run.
  await win.webContents.executeJavaScript(`localStorage.setItem('dtm_active_skin','${name}')`);
  await win.webContents.reload();
  await new Promise(r => setTimeout(r, 4000));
}

async function inspect(win, name) {
  const result = {};
  try {
    const desk = await win.webContents.executeJavaScript('window.dtmEngine.fs.getDesktop()');
    result.realItemCount = (desk.items || []).length;
  } catch (e) { result.getDesktopErr = e.message; }
  try {
    const dom = await win.webContents.executeJavaScript(`
      (() => {
        const frame = document.getElementById('skin-viewport');
        const doc = frame.contentWindow.document;
        const layer = doc.querySelector('.dtm-desktop-layer');
        const icons = Array.from(doc.querySelectorAll('.dtm-icon'));
        const sys = Array.from(doc.querySelectorAll('.dtm-icon[data-system]')).map(i => i.dataset.system);
        const imgOk = icons.some(i => {
          const img = i.querySelector('img');
          return img && typeof img.src === 'string' && img.src.startsWith('data:image/png;base64,') && img.src.length > 200;
        });
        return {
          hasLayer: !!layer, layerSkin: layer ? layer.dataset.skin : null,
          totalIcons: icons.length, systemIcons: sys, atLeastOneRealIconImg: imgOk,
          oldIconGridHidden: (() => { const g = doc.getElementById('iconGrid'); const d = doc.getElementById('desktop-icons'); return { iconGrid: g ? g.style.display : 'absent', desktopIcons: d ? d.style.display : 'absent' }; })()
        };
      })()
    `);
    Object.assign(result, dom);
  } catch (e) { result.domErr = e.message; }
  return result;
}

app.whenReady().then(async () => {
  try {
    registerIpcHandlers();
    const win = new BrowserWindow({
      show: false, width: 1280, height: 840,
      webPreferences: { preload: path.join(__dirname, '../electron/preload/index.js'), contextIsolation: true, nodeIntegration: false }
    });
    const errors = [];
    win.webContents.on('console-message', (e, level, message) => { if (level >= 2 && !message.includes('Autoplay')) errors.push(message); });

    await win.webContents.session.clearCache();
    await win.loadFile(path.join(__dirname, '../src/index.html'));
    await new Promise(r => setTimeout(r, 3500));
    out.mountDesktopExposed = await win.webContents.executeJavaScript('!!(window.dtmEngine && window.dtmEngine.mountDesktop)').catch(() => 'ERR');

    for (const skin of SKINS) {
      await loadSkin(win, skin);
      out[skin] = await inspect(win, skin);
    }
    out.consoleErrors = errors;
  } catch (e) { out.fatal = e.message; }
  finish();
});
