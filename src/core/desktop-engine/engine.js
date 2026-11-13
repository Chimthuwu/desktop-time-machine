/**
 * Desktop Time Machine - Core Desktop Engine
 * 
 * Provides the shared runtime API exposed to skins and the shell.
 * Bridges securely to the preload API (dtmPreload) when running in Electron,
 * and provides safe mock fallbacks when running in a standalone browser for dev.
 */

class DesktopEngine {
  constructor() {
    this.preload = window.dtmPreload || this.createMockPreload();
    this.systemInfo = null;
    this.currentSkin = 'windows95';
    this.listeners = new Map();
  }

  async init() {
    try {
      this.systemInfo = await this.preload.getSystemInfo();
      console.log('[DTM Engine] Initialized on host:', this.systemInfo.hostname);
    } catch (err) {
      console.warn('[DTM Engine] Could not fetch system info:', err);
    }
  }

  // Event Subscription System
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const filtered = this.listeners.get(event).filter(cb => cb !== callback);
    this.listeners.set(event, filtered);
  }

  emit(event, data) {
    if (!this.listeners.has(event)) return;
    this.listeners.get(event).forEach(cb => {
      try {
        cb(data);
      } catch (e) {
        console.error(`[DTM Engine] Error in listener for ${event}:`, e);
      }
    });
  }

  // Shared real filesystem API — one backend for every skin.
  // Paths are real absolute host paths; every operation is validated in the
  // Electron main process before it touches the disk.
  get fs() {
    const backend = this.preload.fs || null;

    const requireBackend = () => {
      if (!backend) throw new Error('engine.fs is unavailable in this host');
      return backend;
    };

    return {
      /** List a directory. Returns { path, parentPath, items, truncated }. */
      list: (dirPath) => {
        if (backend) return backend.list(dirPath);
        // Legacy fallback for older preload bridges without `fs`
        return this.preload.listDirectory(dirPath).then((result) => ({
          path: result.currentPath,
          parentPath: result.parentPath,
          items: result.items,
          truncated: !!result.truncated
        }));
      },
      stat: (targetPath) => requireBackend().stat(targetPath),
      read: (targetPath) => requireBackend().read(targetPath),
      readBinary: (targetPath) => requireBackend().readBinary(targetPath),
      write: (targetPath, content) => requireBackend().write(targetPath, content),
      writeBinary: (targetPath, data) => requireBackend().writeBinary(targetPath, data),
      mkdir: (targetPath) => requireBackend().mkdir(targetPath),
      rename: (targetPath, newName) => requireBackend().rename(targetPath, newName),
      copy: (srcPath, destPath) => requireBackend().copy(srcPath, destPath),
      move: (srcPath, destPath) => requireBackend().move(srcPath, destPath),
      remove: (targetPath) => requireBackend().remove(targetPath),
      removeRecursive: (targetPath) => requireBackend().removeRecursive(targetPath),
      exists: (targetPath) => requireBackend().exists(targetPath),
      getDrives: () => requireBackend().getDrives(),
      getSpecialFolders: () => requireBackend().getSpecialFolders()
    };
  }

  // System API
  get system() {
    return {
      getInfo: async () => {
        if (!this.systemInfo) {
          this.systemInfo = await this.preload.getSystemInfo();
        }
        return this.systemInfo;
      },
      // Legacy alias kept for older skins — new code should use engine.fs
      listDirectory: async (dirPath) => {
        const result = await this.fs.list(dirPath);
        return {
          currentPath: result.path,
          parentPath: result.parentPath,
          items: result.items,
          truncated: result.truncated
        };
      },
      openPath: (targetPath) => this.preload.openPath(targetPath),
      openExternalUrl: (url) => this.preload.openExternalUrl(url),
      launchProgram: (program) => this.preload.launchProgram(program),
      toggleFullScreen: () => this.preload.toggleFullScreen(),
      minimizeWindow: () => this.preload.minimizeWindow(),
      maximizeWindow: () => this.preload.maximizeWindow(),
      exit: () => this.preload.exitApp()
    };
  }

  // SDK API — utilities for skin development and validation
  get sdk() {
    return {
      /**
       * Validates a skin manifest object against the DTM Skin SDK spec.
       * @param {object} manifest - Parsed manifest JSON object
       * @param {string} skinId - Expected skin folder/id
       * @returns {Promise<{valid: boolean, errors: string[]}>}
       */
      validateManifest: (manifest, skinId) => {
        if (this.preload.validateManifest) {
          return this.preload.validateManifest(manifest, skinId);
        }
        // Mock validation for browser dev mode
        const errors = [];
        const required = ['id', 'name', 'era', 'version', 'entry', 'engineCompatibility', 'status'];
        for (const f of required) {
          if (!manifest[f]) errors.push(`Missing required field: "${f}"`);
        }
        return Promise.resolve({ valid: errors.length === 0, errors });
      },

      /**
       * Returns the current DTM engine version.
       * @returns {string}
       */
      getEngineVersion: () => '1.0',

      /**
       * Returns the list of defined capability identifiers.
       * @returns {string[]}
       */
      getKnownCapabilities: () => [
        'window-management',
        'filesystem',
        'application-launcher',
        'desktop-icons',
        'start-menu',
        'taskbar',
        'screensaver',
        'apple-menu',
        'control-strip',
        'calculator',
        'sound-chimes',
        'trash-bin',
        'active-desktop',
        'quick-launch',
        'multimedia',
        'luna-theme',
        'two-column-start',
        'visual-styles',
        'amiga-dock',
        'custom-screens',
        'cli',
        'tabbed-windows',
        'deskbar',
        'workspaces',
        'dock',
        'expose',
        'aqua'
      ]
    };
  }

  // In-memory filesystem used only by the browser preview mock.
  createMockFs() {
    const now = Date.now();
    const entries = new Map();

    const toKey = (input) => {
      let value = String(input || 'C:\\Users\\User').replace(/\//g, '\\');
      value = value.replace(/\\+/g, '\\');
      if (value.length > 3 && value.endsWith('\\')) value = value.slice(0, -1);
      return value.toLowerCase();
    };
    const nameOf = (input) => {
      const value = String(input);
      const idx = Math.max(value.lastIndexOf('\\'), value.lastIndexOf('/'));
      return idx >= 0 ? value.slice(idx + 1) : value;
    };
    const parentKeyOf = (key) => {
      const idx = key.lastIndexOf('\\');
      return idx > 2 ? key.slice(0, idx) : null;
    };
    const publicEntry = (entry) => ({
      name: entry.name,
      path: entry.path,
      isDirectory: entry.isDirectory,
      isFile: entry.isFile,
      isSymlink: false,
      size: entry.size,
      modified: entry.modified,
      created: entry.created,
      hidden: entry.hidden
    });
    const seed = (targetPath, type, content = '') => {
      const key = toKey(targetPath);
      entries.set(key, {
        key,
        path: String(targetPath),
        name: nameOf(targetPath),
        isDirectory: type === 'dir',
        isFile: type === 'file',
        size: type === 'file' ? content.length : 0,
        modified: now,
        created: now,
        hidden: false,
        content: type === 'file' ? content : null
      });
    };

    seed('C:\\', 'dir');
    seed('C:\\Users\\User', 'dir');
    seed('C:\\Users\\User\\Desktop', 'dir');
    seed('C:\\Users\\User\\Documents', 'dir');
    seed('C:\\Users\\User\\Downloads', 'dir');
    seed('C:\\Users\\User\\Pictures', 'dir');
    seed('C:\\Users\\User\\Music', 'dir');
    seed('C:\\Users\\User\\Videos', 'dir');
    seed('C:\\Users\\User\\Desktop\\Welcome.txt', 'file', 'Welcome to Desktop Time Machine.');
    seed('C:\\Users\\User\\Documents\\Read Me.txt', 'file', 'This is a mock document.');
    seed('C:\\Users\\User\\Downloads\\setup.exe', 'file', 'MOCKBINARY');
    seed('C:\\Users\\User\\Pictures\\sunset.jpg', 'file', 'MOCKIMAGE');

    const cloneEntry = (entry, destPath) => {
      entries.set(toKey(destPath), {
        key: toKey(destPath),
        path: String(destPath),
        name: nameOf(destPath),
        isDirectory: entry.isDirectory,
        isFile: entry.isFile,
        size: entry.size,
        modified: Date.now(),
        created: entry.created,
        hidden: entry.hidden,
        content: entry.content
      });
      if (entry.isDirectory) {
        for (const child of [...entries.values()]) {
          if (parentKeyOf(child.key) === entry.key) {
            cloneEntry(child, `${destPath}\\${child.name}`);
          }
        }
      }
    };

    return {
      list(dirPath) {
        const key = toKey(dirPath || 'C:\\Users\\User');
        const dir = entries.get(key);
        if (!dir || !dir.isDirectory) return Promise.reject(new Error(`Not found: ${dirPath}`));
        const items = [];
        for (const entry of entries.values()) {
          if (parentKeyOf(entry.key) === key) items.push(publicEntry(entry));
        }
        items.sort((a, b) => {
          const aDir = a.isDirectory ? 0 : 1;
          const bDir = b.isDirectory ? 0 : 1;
          if (aDir !== bDir) return aDir - bDir;
          return a.name.localeCompare(b.name);
        });
        const parent = parentKeyOf(key);
        return Promise.resolve({
          path: dir.path,
          parentPath: parent ? (entries.get(parent) ? entries.get(parent).path : parent) : null,
          items,
          truncated: false
        });
      },
      stat(targetPath) {
        const entry = entries.get(toKey(targetPath));
        if (!entry) return Promise.reject(new Error(`Not found: ${targetPath}`));
        return Promise.resolve(publicEntry(entry));
      },
      read(targetPath) {
        const entry = entries.get(toKey(targetPath));
        if (!entry || !entry.isFile) return Promise.reject(new Error(`Not found: ${targetPath}`));
        return Promise.resolve(entry.content || '');
      },
      readBinary(targetPath) {
        const entry = entries.get(toKey(targetPath));
        if (!entry || !entry.isFile) return Promise.reject(new Error(`Not found: ${targetPath}`));
        const text = entry.content || '';
        const buffer = new ArrayBuffer(text.length);
        const view = new Uint8Array(buffer);
        for (let i = 0; i < text.length; i++) view[i] = text.charCodeAt(i) & 0xff;
        return Promise.resolve(buffer);
      },
      write(targetPath, content) {
        entries.set(toKey(targetPath), {
          key: toKey(targetPath),
          path: String(targetPath),
          name: nameOf(targetPath),
          isDirectory: false,
          isFile: true,
          size: content.length,
          modified: Date.now(),
          created: Date.now(),
          hidden: false,
          content
        });
        return Promise.resolve({ success: true, path: targetPath, bytes: content.length });
      },
      writeBinary(targetPath, data) {
        const view = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
        let text = '';
        for (let i = 0; i < view.length; i++) text += String.fromCharCode(view[i]);
        return this.write(targetPath, text);
      },
      mkdir(targetPath) {
        entries.set(toKey(targetPath), {
          key: toKey(targetPath),
          path: String(targetPath),
          name: nameOf(targetPath),
          isDirectory: true,
          isFile: false,
          size: 0,
          modified: Date.now(),
          created: Date.now(),
          hidden: false,
          content: null
        });
        return Promise.resolve({ success: true, path: targetPath });
      },
      rename(targetPath, newName) {
        const key = toKey(targetPath);
        const entry = entries.get(key);
        if (!entry) return Promise.reject(new Error(`Not found: ${targetPath}`));
        const parent = parentKeyOf(key) || '';
        const dest = parent ? `${parent}\\${newName}` : newName;
        entries.delete(key);
        entry.key = toKey(dest);
        entry.path = dest;
        entry.name = newName;
        entries.set(entry.key, entry);
        return Promise.resolve({ success: true, src: targetPath, dest });
      },
      copy(srcPath, destPath) {
        const src = entries.get(toKey(srcPath));
        if (!src) return Promise.reject(new Error(`Not found: ${srcPath}`));
        cloneEntry(src, destPath);
        return Promise.resolve({ success: true, src: srcPath, dest: destPath });
      },
      move(srcPath, destPath) {
        return this.copy(srcPath, destPath).then(() => this.removeRecursive(srcPath));
      },
      remove(targetPath) {
        const key = toKey(targetPath);
        const entry = entries.get(key);
        if (!entry) return Promise.reject(new Error(`Not found: ${targetPath}`));
        if (entry.isDirectory) {
          for (const child of entries.values()) {
            if (parentKeyOf(child.key) === key) {
              return Promise.reject(new Error(`Directory not empty: ${targetPath}`));
            }
          }
        }
        entries.delete(key);
        return Promise.resolve({ success: true, path: targetPath });
      },
      removeRecursive(targetPath) {
        const key = toKey(targetPath);
        for (const childKey of [...entries.keys()]) {
          if (childKey === key || childKey.startsWith(key + '\\')) entries.delete(childKey);
        }
        return Promise.resolve({ success: true, path: targetPath });
      },
      exists(targetPath) {
        return Promise.resolve(entries.has(toKey(targetPath)));
      },
      getDrives() {
        return Promise.resolve([
          { letter: 'C', path: 'C:\\', label: 'C:', totalBytes: 64 * 1024 * 1024 * 1024, freeBytes: 32 * 1024 * 1024 * 1024, removable: false },
          { letter: 'D', path: 'D:\\', label: 'D:', totalBytes: 128 * 1024 * 1024 * 1024, freeBytes: 96 * 1024 * 1024 * 1024, removable: false }
        ]);
      },
      getSpecialFolders() {
        return Promise.resolve({
          home: 'C:\\Users\\User',
          desktop: 'C:\\Users\\User\\Desktop',
          documents: 'C:\\Users\\User\\Documents',
          downloads: 'C:\\Users\\User\\Downloads',
          pictures: 'C:\\Users\\User\\Pictures',
          music: 'C:\\Users\\User\\Music',
          videos: 'C:\\Users\\User\\Videos'
        });
      }
    };
  }

  // Mock preload for testing in regular browsers
  createMockPreload() {
    console.info('[DTM Engine] Running in browser preview mode (mock preload active)');
    const mockFs = this.createMockFs();
    return {
      fs: mockFs,
      getSystemInfo: async () => ({
        platform: 'win32',
        release: '10.0.22631',
        type: 'Windows_NT',
        arch: 'x64',
        hostname: 'RETRO-PC-MOCK',
        username: 'User',
        homeDir: 'C:\\Users\\User',
        totalMemoryMB: 16384,
        freeMemoryMB: 8192,
        uptimeSeconds: 3600
      }),
      listDirectory: async (dirPath) => {
        const result = await mockFs.list(dirPath);
        return {
          currentPath: result.path,
          parentPath: result.parentPath,
          items: result.items
        };
      },
      openPath: async (targetPath) => {
        console.log('[Mock Preload] Open path:', targetPath);
        return { success: true };
      },
      openExternalUrl: async (url) => {
        window.open(url, '_blank');
        return { success: true };
      },
      launchProgram: async (program) => {
        alert(`[Mock] Launching program: ${program}`);
        return { success: true, program };
      },
      toggleFullScreen: async () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
          return true;
        } else {
          document.exitFullscreen().catch(() => {});
          return false;
        }
      },
      minimizeWindow: async () => console.log('[Mock] Minimize window'),
      maximizeWindow: async () => console.log('[Mock] Maximize window'),
      exitApp: async () => {
        document.body.innerHTML = '<div style="background:#000;color:#aaa;height:100vh;display:grid;place-items:center;font:20px Tahoma">It is now safe to turn off your computer.</div>';
        return { success: true };
      },
      getAvailableSkins: async () => [],
      validateManifest: async (manifest, skinId) => {
        const required = ['id', 'name', 'era', 'version', 'entry', 'engineCompatibility', 'status'];
        const errors = [];
        for (const f of required) {
          if (!manifest[f]) errors.push(`Missing required field: "${f}"`);
        }
        return { valid: errors.length === 0, errors };
      }
    };
  }
}

// Create and expose global singleton
window.dtmEngine = new DesktopEngine();
window.DTM = window.dtmEngine;
