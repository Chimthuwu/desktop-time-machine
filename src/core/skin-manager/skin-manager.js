/**
 * Desktop Time Machine - Skin Manager
 * Handles discovery, manifest validation, switching, and registry of retro skins
 */

class SkinManager {
  constructor(engine) {
    this.engine = engine;
    this.activeSkinId = localStorage.getItem('dtm_active_skin') || 'windows95';
    this.skins = new Map();
    this.fallbackSkins = [
      {
        id: 'windows95',
        name: 'Windows 95',
        period: '1995',
        version: '1.0.0',
        description: 'The landmark 32-bit operating system that introduced the Start button, taskbar, grey 3D bevels, and modern desktop paradigm.',
        author: 'Retro Desktop Simulator',
        entry: './skins/windows95/desktop.html',
        status: 'ready',
        icon: '🪟',
        capabilities: ['window-management', 'filesystem', 'application-launcher', 'desktop-icons', 'start-menu', 'screensaver']
      },
      {
        id: 'macos8',
        name: 'Mac OS 8',
        period: '1997',
        version: '1.0.0',
        description: 'The classic Macintosh Platinum appearance with authentic grey dither background, top menu bar, Apple menu, and Control Strip.',
        author: 'Retro Desktop Simulator',
        entry: './skins/macos8/desktop.html',
        status: 'ready',
        icon: '💻',
        capabilities: ['window-management', 'desktop-icons', 'apple-menu', 'control-strip', 'calculator', 'sound-chimes']
      },
      {
        id: 'windows98',
        name: 'Windows 98',
        period: '1998',
        version: '1.0.0',
        description: 'Active Desktop era with web integration, gradient title bars, Quick Launch toolbar, and enhanced multimedia. Windows 98 built on 95\'s foundation with tighter Internet Explorer 4 integration and a more polished shell.',
        author: 'Desktop Time Machine',
        status: 'ready',
        icon: '🪟',
        capabilities: ['window-management', 'filesystem', 'application-launcher', 'desktop-icons', 'start-menu', 'taskbar', 'quick-launch', 'active-desktop', 'multimedia', 'screensaver']
      },
      {
        id: 'windowsXP',
        name: 'Windows XP (Luna)',
        period: '2001',
        version: '0.1.0',
        description: 'The iconic blue Luna interface with two-column Start menu, rounded window frames, and vibrant wallpapers.',
        author: 'Community',
        status: 'roadmap',
        icon: '🖼️',
        capabilities: ['luna-theme', 'two-column-start', 'visual-styles']
      },
      {
        id: 'amiga-workbench',
        name: 'Amiga Workbench 3.1',
        period: '1985–1993',
        version: '0.1.0',
        description: 'Preemptive multitasking pioneer with top title bar, blue/orange palette, ram disk icons, and high-performance feel.',
        author: 'Community',
        status: 'roadmap',
        icon: '💾',
        capabilities: ['amiga-dock', 'custom-screens', 'cli']
      },
      {
        id: 'beos',
        name: 'BeOS R5',
        period: '1998',
        version: '0.1.0',
        description: 'The revolutionary multimedia OS featuring yellow tabbed window title bars, Deskbar, and clean typography.',
        author: 'Community',
        status: 'roadmap',
        icon: '⚡',
        capabilities: ['tabbed-windows', 'deskbar', 'workspaces']
      }
    ];
  }

  async init() {
    // Populate fallback skins first
    this.fallbackSkins.forEach(skin => this.skins.set(skin.id, skin));

    // Discover installed skins through IPC
    try {
      const installedSkins = await this.engine.preload.getAvailableSkins();
      if (Array.isArray(installedSkins) && installedSkins.length > 0) {
        installedSkins.forEach(skin => {
          const entryPath = `./skins/${skin.folder}/${skin.entry || 'desktop.html'}`;
          this.skins.set(skin.id, {
            ...skin,
            entry: entryPath,
            status: skin.status || 'ready'
          });
        });
      }
    } catch (err) {
      console.warn('[SkinManager] Could not dynamically load skins via IPC:', err);
    }

    console.log(`[SkinManager] Loaded ${this.skins.size} skins into registry.`);
  }

  getAvailableSkins() {
    return Array.from(this.skins.values());
  }

  getSkin(skinId) {
    return this.skins.get(skinId) || null;
  }

  getCurrentSkin() {
    return this.getSkin(this.activeSkinId) || this.skins.get('windows95');
  }

  switchSkin(skinId) {
    const skin = this.getSkin(skinId);
    if (!skin) {
      console.error(`[SkinManager] Unknown skin: ${skinId}`);
      return false;
    }

    if (skin.status !== 'ready') {
      alert(`The ${skin.name} environment is currently under construction and slated for a future roadmap milestone!`);
      return false;
    }

    this.activeSkinId = skinId;
    localStorage.setItem('dtm_active_skin', skinId);

    // Notify shell/listeners
    this.engine.emit('dtm:skin-changed', skin);

    // Update the viewport frame
    const viewport = document.getElementById('skin-viewport');
    if (viewport) {
      viewport.onload = () => {
        try {
          viewport.contentWindow.focus();
        } catch (e) {}
      };
      viewport.src = skin.entry;
    }

    return true;
  }
}

window.dtmSkinManager = new SkinManager(window.dtmEngine);
window.DTM.skins = window.dtmSkinManager;
