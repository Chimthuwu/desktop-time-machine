# Desktop Time Machine — Skin API Reference

**Version:** 1.0  
**Engine Compatibility:** 1.0+  
**Language:** TypeScript 5.x definitions

---

## Global Namespace: `window.DTM`

```typescript
interface DTMNamespace {
  /** The shared engine instance — primary API surface for skins */
  engine: Engine;
  
  /** Skin manager — discovery, switching, registry */
  skins: SkinManager;
  
  /** UI components — Era Switcher, etc. */
  ui: {
    switcher: SkinSwitcherUI;
  };
}

declare global {
  interface Window {
    DTM: DTMNamespace;
    dtmEngine: Engine;           // Legacy alias
    dtmSkinManager: SkinManager; // Legacy alias
    dtmSwitcherUI: SkinSwitcherUI; // Legacy alias
  }
}
```

---

## Engine API (`window.DTM.engine`)

### Types

```typescript
// ─────────────────────────────────────────────────────────────
// FILESYSTEM
// ─────────────────────────────────────────────────────────────

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: number;           // Unix timestamp (ms)
  mimeType?: string;
}

interface FileStat {
  isDirectory: boolean;
  size: number;
  modified: number;
  created: number;
  mimeType?: string;
  permissions?: string;       // e.g., "0644"
}

interface FilesystemAPI {
  /** List directory contents */
  list(path: string): Promise<FileEntry[]>;
  
  /** Read file as UTF-8 text */
  read(path: string): Promise<string>;
  
  /** Read file as ArrayBuffer */
  readBinary(path: string): Promise<ArrayBuffer>;
  
  /** Write text file (creates parent dirs) */
  write(path: string, content: string): Promise<void>;
  
  /** Write binary file */
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  
  /** Create directory recursively */
  mkdir(path: string): Promise<void>;
  
  /** Remove file or empty directory */
  remove(path: string): Promise<void>;
  
  /** Remove directory recursively */
  removeRecursive(path: string): Promise<void>;
  
  /** Check if path exists */
  exists(path: string): Promise<boolean>;
  
  /** Get file/directory metadata */
  stat(path: string): Promise<FileStat>;
  
  /** Copy file */
  copy(src: string, dest: string): Promise<void>;
  
  /** Move/rename file or directory */
  move(src: string, dest: string): Promise<void>;
  
  /** Read directory as async iterator (for large dirs) */
  *listIterator(path: string): AsyncIterableIterator<FileEntry>;
}

// ─────────────────────────────────────────────────────────────
// PROCESS EXECUTION
// ─────────────────────────────────────────────────────────────

interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  signal?: string;            // e.g., "SIGTERM" if killed
}

interface ProcessAPI {
  /** 
   * Spawn an allowlisted executable.
   * Only executables in the main-process allowlist can be spawned.
   * @throws {Error} If executable not allowlisted or spawn fails
   */
  spawn(executable: string, args?: string[]): Promise<ProcessResult>;
  
  /** Check if an executable is on the allowlist */
  isAllowed(executable: string): Promise<boolean>;
  
  /** Get the current allowlist */
  getAllowlist(): Promise<string[]>;
  
  /** 
   * Spawn with options (advanced)
   * @param options.cwd Working directory (must be within sandbox)
   * @param options.timeout Ms to wait before killing (default: 30000)
   * @param options.env Additional environment variables
   */
  spawnWithOptions(
    executable: string, 
    args: string[], 
    options?: {
      cwd?: string;
      timeout?: number;
      env?: Record<string, string>;
    }
  ): Promise<ProcessResult>;
}

// ─────────────────────────────────────────────────────────────
// WINDOW MANAGEMENT (Engine-level)
// ─────────────────────────────────────────────────────────────

interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WindowOptions {
  title: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  content: string;              // HTML content to load
  resizable?: boolean;          // default: true
  maximizable?: boolean;        // default: true
  minimizable?: boolean;        // default: true
  closable?: boolean;           // default: true
  skinId?: string;              // Associate with a skin
  alwaysOnTop?: boolean;        // default: false
  frame?: boolean;              // default: true (show chrome)
  transparent?: boolean;        // default: false
}

interface WindowState {
  id: string;
  title: string;
  bounds: WindowBounds;
  isFocused: boolean;
  isMaximized: boolean;
  isMinimized: boolean;
  skinId?: string;
  processId?: number;           // If backed by a renderer process
}

type WindowEventType = 
  | 'created' 
  | 'closed' 
  | 'focused' 
  | 'blurred' 
  | 'moved' 
  | 'resized' 
  | 'maximized' 
  | 'minimized' 
  | 'restored';

interface WindowEvent {
  type: WindowEventType;
  windowId: string;
  timestamp: number;
  payload?: {
    bounds?: WindowBounds;
    previousBounds?: WindowBounds;
  };
}

interface WindowManagerAPI {
  /** Create a new engine-managed window */
  create(options: WindowOptions): Promise<string>; // returns windowId
  
  /** Close a window by ID */
  close(windowId: string): Promise<void>;
  
  /** Focus a window */
  focus(windowId: string): Promise<void>;
  
  /** Get window state */
  getState(windowId: string): Promise<WindowState | null>;
  
  /** List all windows */
  list(): Promise<WindowState[]>;
  
  /** Subscribe to window events */
  on(event: WindowEventType, handler: (event: WindowEvent) => void): void;
  
  /** Unsubscribe */
  off(event: WindowEventType, handler: (event: WindowEvent) => void): void;
  
  /** Get windows for a specific skin */
  getBySkin(skinId: string): Promise<WindowState[]>;
}

// ─────────────────────────────────────────────────────────────
// SYSTEM INFO
// ─────────────────────────────────────────────────────────────

interface SystemInfo {
  platform: 'win32' | 'darwin' | 'linux';
  arch: string;                 // e.g., "x64", "arm64"
  hostname: string;
  username: string;
  homeDir: string;              // User home directory
  tempDir: string;              // System temp directory
  cpus: number;
  totalMemory: number;          // Bytes
  freeMemory: number;           // Bytes
  electronVersion: string;
  nodeVersion: string;
  dtmVersion: string;           // Desktop Time Machine version
  skinApiVersion: string;       // This API version
}

interface SystemAPI {
  /** Get host system information */
  getInfo(): Promise<SystemInfo>;
  
  /** Get environment variable (sandboxed) */
  getEnv(name: string): Promise<string | undefined>;
  
  /** Get multiple environment variables */
  getEnvBatch(names: string[]): Promise<Record<string, string | undefined>>;
}

// ─────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────

interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;                // Emoji, data URL, or asset path
  silent?: boolean;             // default: false
  urgency?: 'low' | 'normal' | 'critical'; // default: 'normal'
  timeout?: number;             // Auto-close ms (default: 5000, 0 = never)
  actions?: NotificationAction[];
}

interface NotificationAction {
  id: string;
  label: string;
  icon?: string;
}

interface NotificationAPI {
  /** Show a system notification */
  notify(options: NotificationOptions): Promise<string>; // returns notificationId
  
  /** Close a notification */
  close(notificationId: string): Promise<void>;
  
  /** Close all notifications */
  closeAll(): Promise<void>;
  
  /** Listen for notification clicks */
  onClick(handler: (notificationId: string, actionId?: string) => void): void;
}

// ─────────────────────────────────────────────────────────────
// CLIPBOARD
// ─────────────────────────────────────────────────────────────

interface ClipboardAPI {
  /** Read text from clipboard */
  readText(): Promise<string>;
  
  /** Write text to clipboard */
  writeText(text: string): Promise<void>;
  
  /** Read image from clipboard as data URL */
  readImage(): Promise<string | null>;
  
  /** Write image to clipboard from data URL */
  writeImage(dataUrl: string): Promise<void>;
  
  /** Check if clipboard has text */
  hasText(): Promise<boolean>;
  
  /** Check if clipboard has image */
  hasImage(): Promise<boolean>;
  
  /** Clear clipboard */
  clear(): Promise<void>;
}

// ─────────────────────────────────────────────────────────────
// SKIN LIFECYCLE
// ─────────────────────────────────────────────────────────────

interface SkinManifest {
  id: string;
  name: string;
  era: string;
  period: string;
  version: string;
  description: string;
  author: string;
  entry: string;
  engineCompatibility: string;
  status: 'ready' | 'roadmap' | 'experimental';
  icon: string;
  themeColor: string;
  previewImage: string | null;
  capabilities: string[];
  meta?: SkinMeta;
}

interface SkinMeta {
  developer: string;
  releaseDate: string;          // YYYY-MM-DD
  successor: string;
  kernelFamily: string;
  historicalNote: string;
}

interface SkinLifecycleAPI {
  /** 
   * Register a cleanup function to be called when this skin is unloaded.
   * CALL THIS DURING INITIALIZATION.
   * @param skinId Your skin's manifest.id
   * @param cleanupFn Function that disposes ALL resources
   */
  onSkinUnload(skinId: string, cleanupFn: () => void): void;
  
  /** 
   * Emit an engine event (for inter-skin or skin-engine communication)
   */
  emit(event: string, ...args: unknown[]): void;
  
  /** 
   * Subscribe to engine events 
   */
  on(event: string, handler: (...args: unknown[]) => void): void;
  
  /** Unsubscribe */
  off(event: string, handler: (...args: unknown[]) => void): void;
  
  /** Get current skin manifest */
  getCurrentSkin(): SkinManifest | null;
  
  /** Get skin manifest by ID */
  getSkin(skinId: string): SkinManifest | null;
}

// ─────────────────────────────────────────────────────────────
// MAIN ENGINE INTERFACE
// ─────────────────────────────────────────────────────────────

interface Engine 
  extends FilesystemAPI, 
          ProcessAPI, 
          WindowManagerAPI, 
          SystemAPI, 
          NotificationAPI, 
          ClipboardAPI, 
          SkinLifecycleAPI {
  /** Engine version */
  readonly version: string;
  
  /** API version */
  readonly apiVersion: string;
  
  /** Check if a feature is available */
  hasFeature(feature: string): boolean;
}
```

---

## Skin Manager API (`window.DTM.skins`)

```typescript
interface SkinManager {
  /** Get all available skins (from registry + discovered) */
  getAvailableSkins(): SkinManifest[];
  
  /** Get a skin by ID */
  getSkin(skinId: string): SkinManifest | null;
  
  /** Get currently active skin */
  getCurrentSkin(): SkinManifest;
  
  /** Switch to a skin by ID */
  switchSkin(skinId: string): boolean;
  
  /** Register a skin discovered at runtime */
  registerSkin(skin: SkinManifest): void;
  
  /** Unregister a skin */
  unregisterSkin(skinId: string): void;
  
  /** Subscribe to skin changes */
  onSkinChanged(handler: (skin: SkinManifest) => void): void;
  
  /** Unsubscribe */
  offSkinChanged(handler: (skin: SkinManifest) => void): void;
}
```

---

## Era Switcher UI (`window.DTM.ui.switcher`)

```typescript
interface SkinSwitcherUI {
  /** Open the Era Switcher modal */
  open(): void;
  
  /** Close the Era Switcher modal */
  close(): void;
  
  /** Toggle open/closed */
  toggle(): void;
  
  /** Check if open */
  readonly isOpen: boolean;
  
  /** Force re-render gallery (after skin registry changes) */
  refresh(): void;
}
```

---

## Validation Helpers

```typescript
// Available in main process via IPC: validate-manifest
// In renderer: window.DTM.engine.validateManifest(manifest)

interface ManifestValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  field: string;        // JSON path, e.g., "capabilities[2]"
  message: string;
  code: 'REQUIRED' | 'TYPE' | 'ENUM' | 'FORMAT' | 'CUSTOM';
}

interface ValidationWarning {
  field: string;
  message: string;
  code: 'DEPRECATED' | 'RECOMMENDED' | 'UNKNOWN_CAPABILITY';
}

// Validation rules (enforced by SkinManager):
const MANIFEST_SCHEMA = {
  id: { required: true, type: 'string', pattern: '^[a-z0-9-]+$' },
  name: { required: true, type: 'string', maxLength: 64 },
  era: { required: true, type: 'string' },
  period: { required: true, type: 'string' },
  version: { required: true, type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+(-.+)?$' },
  description: { required: true, type: 'string', maxLength: 500 },
  author: { required: true, type: 'string', maxLength: 64 },
  entry: { required: true, type: 'string' },
  engineCompatibility: { required: true, type: 'string' },
  status: { required: true, type: 'string', enum: ['ready', 'roadmap', 'experimental'] },
  icon: { required: true, type: 'string', maxLength: 4 }, // emoji or 1-2 chars
  themeColor: { required: true, type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
  previewImage: { required: false, type: ['string', 'null'] },
  capabilities: { required: true, type: 'array', items: { type: 'string' } },
  meta: { 
    required: false, 
    type: 'object',
    properties: {
      developer: { type: 'string' },
      releaseDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      successor: { type: 'string' },
      kernelFamily: { type: 'string' },
      historicalNote: { type: 'string' }
    }
  }
};
```

---

## Error Codes

```typescript
enum EngineErrorCode {
  // Filesystem
  FS_NOT_FOUND = 'FS_NOT_FOUND',
  FS_PERMISSION_DENIED = 'FS_PERMISSION_DENIED',
  FS_OUT_OF_SANDBOX = 'FS_OUT_OF_SANDBOX',
  FS_QUOTA_EXCEEDED = 'FS_QUOTA_EXCEEDED',
  FS_INVALID_PATH = 'FS_INVALID_PATH',
  
  // Process
  PROC_NOT_ALLOWED = 'PROC_NOT_ALLOWED',
  PROC_SPAWN_FAILED = 'PROC_SPAWN_FAILED',
  PROC_TIMEOUT = 'PROC_TIMEOUT',
  PROC_KILLED = 'PROC_KILLED',
  
  // Window
  WIN_NOT_FOUND = 'WIN_NOT_FOUND',
  WIN_CREATE_FAILED = 'WIN_CREATE_FAILED',
  
  // System
  SYS_INFO_UNAVAILABLE = 'SYS_INFO_UNAVAILABLE',
  
  // Notification
  NOTIF_PERMISSION_DENIED = 'NOTIF_PERMISSION_DENIED',
  
  // Clipboard
  CLIPBOARD_UNAVAILABLE = 'CLIPBOARD_UNAVAILABLE',
  CLIPBOARD_EMPTY = 'CLIPBOARD_EMPTY',
  
  // Skin
  SKIN_NOT_FOUND = 'SKIN_NOT_FOUND',
  SKIN_LOAD_FAILED = 'SKIN_LOAD_FAILED',
  SKIN_VALIDATION_FAILED = 'SKIN_VALIDATION_FAILED',
  SKIN_CLEANUP_FAILED = 'SKIN_CLEANUP_FAILED',
  
  // General
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
}

class EngineError extends Error {
  constructor(
    public code: EngineErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'EngineError';
  }
}
```

---

## Usage Examples

### Basic Filesystem Operations

```typescript
const engine = window.DTM.engine;

// List desktop
const files = await engine.list('/home/user/Desktop');
console.log(files.map(f => f.name));

// Read a text file
const content = await engine.read('/home/user/Desktop/readme.txt');

// Write a file
await engine.write('/home/user/Desktop/note.txt', 'Hello from my skin!');

// Create directory
await engine.mkdir('/home/user/Desktop/MyFolder');
```

### Process Execution

```typescript
const engine = window.DTM.engine;

// Check if allowed
if (await engine.isAllowed('notepad.exe')) {
  const result = await engine.spawn('notepad.exe', ['/home/user/Desktop/note.txt']);
  console.log('Exit code:', result.exitCode);
}
```

### Engine Window Creation

```typescript
const engine = window.DTM.engine;

const winId = await engine.windows.create({
  title: 'My Engine Window',
  width: 600,
  height: 400,
  content: '<h1>Hello from engine window!</h1>',
  skinId: 'my-skin-id',
});

// Later...
await engine.windows.close(winId);
```

### Skin Lifecycle

```typescript
const engine = window.DTM.engine;

function cleanup() {
  // Clear intervals
  if (clockInterval) clearInterval(clockInterval);
  
  // Cancel animation frames
  if (animFrame) cancelAnimationFrame(animFrame);
  
  // Remove listeners
  document.removeEventListener('click', handleClick);
  
  // Close audio
  audioCtx?.close();
  
  // Disconnect observers
  resizeObserver?.disconnect();
  
  // Clear globals
  window.MySkin = null;
}

// Register ON INITIALIZATION
engine.onSkinUnload('my-skin-id', cleanup);
```

### Event Handling

```typescript
const engine = window.DTM.engine;

// Listen for skin changes
engine.on('dtm:skin-changed', (skin) => {
  console.log('Switched to:', skin.name);
});

// Listen for window events
engine.windows.on('created', (event) => {
  console.log('Window created:', event.windowId);
});

// Listen for Era Switcher open request
engine.on('dtm:open-switcher', () => {
  // Skin can respond if needed
});
```

---

## Version History

| API Version | Engine Version | Changes |
|-------------|----------------|---------|
| 1.0 | 1.0.0 | Initial release |

---

*This reference matches the actual implementation in `electron/preload/index.js` and `src/core/desktop-engine/engine.js`. If you find a discrepancy, the implementation is the source of truth.*