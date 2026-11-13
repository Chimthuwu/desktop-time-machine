/**
 * Example App — Demonstrates Shared Engine API Usage
 * 
 * This app runs inside a skin's window (iframe) and communicates with
 * the shared engine via window.DTM.engine (exposed by the preload script).
 */

const ExampleApp = (() => {
  // Private state
  let engine = null;
  let elements = {};

  // DOM element references
  function cacheElements() {
    elements = {
      filePreview: document.getElementById('filePreview'),
      sysInfo: document.getElementById('sysInfo'),
      statusBar: document.getElementById('statusBar'),
      demoButtons: document.querySelectorAll('.demo-btn'),
    };
  }

  // Get engine reference
  function getEngine() {
    if (!engine) {
      engine = window.DTM?.engine;
    }
    return engine;
  }

  // Update status bar
  function setStatus(message) {
    if (elements.statusBar) {
      elements.statusBar.textContent = message;
    }
  }

  // Show content in preview area
  function showPreview(content, isError = false) {
    if (!elements.filePreview) return;
    elements.filePreview.innerHTML = '';
    const pre = document.createElement('pre');
    pre.style.margin = '0';
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.wordWrap = 'break-word';
    pre.style.color = isError ? '#cc0000' : 'inherit';
    pre.textContent = content;
    elements.filePreview.appendChild(pre);
  }

  function showSysInfo(content, isError = false) {
    if (!elements.sysInfo) return;
    elements.sysInfo.innerHTML = '';
    const pre = document.createElement('pre');
    pre.style.margin = '0';
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.wordWrap = 'break-word';
    pre.style.color = isError ? '#cc0000' : 'inherit';
    pre.textContent = content;
    elements.sysInfo.appendChild(pre);
  }

  // API Demo: List files via engine.fs.list
  async function handleFsList() {
    const eng = getEngine();
    if (!eng || !eng.fs) {
      showPreview('ERROR: engine.fs not available', true);
      setStatus('Filesystem API unavailable');
      return;
    }

    setStatus('Loading directory listing...');
    try {
      // Try to list the user's Desktop folder
      const homeDir = await eng.system.getInfo().then(info => info.homeDir).catch(() => null);
      const desktopPath = homeDir ? `${homeDir}/Desktop` : '/home/user/Desktop';
      
      const result = await eng.fs.list(desktopPath);
      showPreview(JSON.stringify(result, null, 2));
      setStatus(`Listed ${result.length} items from ${desktopPath}`);
    } catch (err) {
      showPreview(`ERROR: ${err.message}`, true);
      setStatus('Failed to list directory');
    }
  }

  // API Demo: Get system info
  async function handleSysInfo() {
    const eng = getEngine();
    if (!eng || !eng.system) {
      showSysInfo('ERROR: engine.system not available', true);
      setStatus('System API unavailable');
      return;
    }

    setStatus('Retrieving system info...');
    try {
      const info = await eng.system.getInfo();
      showSysInfo(JSON.stringify(info, null, 2));
      setStatus('System info retrieved');
    } catch (err) {
      showSysInfo(`ERROR: ${err.message}`, true);
      setStatus('Failed to get system info');
    }
  }

  // API Demo: Show notification
  async function handleNotify() {
    const eng = getEngine();
    if (!eng || !eng.notify) {
      setStatus('Notification API unavailable');
      return;
    }

    setStatus('Sending notification...');
    try {
      await eng.notify({
        title: 'Example App',
        body: 'This notification came from the shared engine!',
        icon: '📝',
      });
      setStatus('Notification sent');
    } catch (err) {
      setStatus(`Notification failed: ${err.message}`);
    }
  }

  // API Demo: Read clipboard
  async function handleClipboard() {
    const eng = getEngine();
    if (!eng || !eng.clipboard) {
      showPreview('ERROR: engine.clipboard not available', true);
      setStatus('Clipboard API unavailable');
      return;
    }

    setStatus('Reading clipboard...');
    try {
      const text = await eng.clipboard.readText();
      showPreview(text || '(clipboard empty)');
      setStatus('Clipboard read');
    } catch (err) {
      showPreview(`ERROR: ${err.message}`, true);
      setStatus('Failed to read clipboard');
    }
  }

  // Event handlers
  function setupEventListeners() {
    elements.demoButtons?.forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        switch (action) {
          case 'fs-list':
            handleFsList();
            break;
          case 'sys-info':
            handleSysInfo();
            break;
          case 'notify':
            handleNotify();
            break;
          case 'clipboard':
            handleClipboard();
            break;
          default:
            console.warn('[ExampleApp] Unknown action:', action);
        }
      });
    });
  }

  // Initialize
  function init() {
    console.log('[ExampleApp] Initializing...');
    cacheElements();
    setupEventListeners();
    setStatus('Ready — click a demo button');
    console.log('[ExampleApp] Initialized');
  }

  // Cleanup
  function cleanup() {
    console.log('[ExampleApp] Cleaning up...');
    elements = {};
    engine = null;
  }

  // Public API
  return { init, cleanup };
})();

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  ExampleApp.init();
});

// Hot reload support
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => ExampleApp.cleanup());
}

// Export for debugging
window.ExampleApp = ExampleApp;