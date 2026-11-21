/**
 * Shared context-menu definitions.
 *
 * The mirror supplies the actions; each platform profile supplies the
 * terminology and which actions belong to that operating system. No skin
 * inherits another operating system's menu entries.
 */
(function () {
  'use strict';

  const WINDOWS = new Set(['windows95', 'windows98', 'windowsXP']);
  const MAC = new Set(['macos8', 'macosx']);

  function profileFor(skinId) {
    if (WINDOWS.has(skinId)) return 'windows';
    if (MAC.has(skinId)) return 'mac';
    return 'generic';
  }

  function itemLabels(profile) {
    if (profile === 'mac') {
      return {
        open: 'Open',
        explore: 'Open Enclosing Folder',
        find: 'Find…',
        cut: 'Cut',
        copy: 'Copy',
        alias: 'Make Alias',
        delete: 'Move to Trash',
        rename: 'Rename…',
        sendTo: null,
        properties: 'Get Info'
      };
    }
    if (profile === 'generic') {
      return {
        open: 'Open', explore: 'Browse Folder', find: null, cut: 'Cut', copy: 'Copy',
        alias: null, delete: 'Delete', rename: 'Rename', sendTo: null, properties: 'Properties'
      };
    }
    return {
      open: 'Open', explore: 'Explore', find: 'Find…', cut: 'Cut', copy: 'Copy',
      alias: 'Create Shortcut', delete: 'Delete', rename: 'Rename',
      sendTo: 'Send To', properties: 'Properties'
    };
  }

  function desktopOptions(profile, skinId) {
    if (profile === 'mac') {
      return {
        arrange: 'Arrange',
        refresh: 'Refresh',
        pasteShortcut: false,
        terminal: skinId === 'macosx' ? 'Open in Terminal' : null,
        properties: 'Get Info',
        propertiesApp: skinId === 'macosx' ? 'preferences' : 'about'
      };
    }
    if (profile === 'generic') {
      return { arrange: null, refresh: 'Refresh', pasteShortcut: false, terminal: null, properties: 'Properties', propertiesApp: 'about' };
    }
    return {
      arrange: 'Arrange Icons',
      refresh: 'Refresh',
      pasteShortcut: true,
      terminal: 'Command Prompt Here',
      properties: 'Properties',
      propertiesApp: 'display'
    };
  }

  window.DTMContextMenus = { profileFor, itemLabels, desktopOptions };
})();
