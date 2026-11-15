/**
 * Desktop Time Machine — window docking helper
 *
 * Electron cannot move windows that belong to another process, so the shell
 * runs a small, long-lived PowerShell helper that talks to user32 directly.
 * It finds a browser window by matching a marker in its command line (the
 * private profile directory) and can move, show, hide and close it.
 *
 * Used by both browser backends (Ungoogled Chromium and Waterfox).
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const HELPER_SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  'Add-Type -TypeDefinition @"',
  'using System;',
  'using System.Runtime.InteropServices;',
  'public class DtmWin {',
  '  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }',
  '  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int t, bool repaint);',
  '  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);',
  '  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int t, uint flags);',
  '  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);',
  '  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);',
  '}',
  '"@',
  '$script:hwnd = [IntPtr]::Zero',
  '$script:rect = @(0, 0, 0, 0)',
  'function Find-MainWindow([string]$marker, [string]$exe) {',
  '  for ($i = 0; $i -lt 120; $i++) {',
  '    $procs = @(Get-CimInstance Win32_Process -Filter "Name=\'$exe\'" |',
  '      Where-Object { $_.CommandLine -and $_.CommandLine.Contains($marker) } |',
  '      ForEach-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue } |',
  '      Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero })',
  '    if ($procs.Count -gt 0) { return $procs[0].MainWindowHandle }',
  '    Start-Sleep -Milliseconds 250',
  '  }',
  '  return [IntPtr]::Zero',
  '}',
  '"ready"',
  '[Console]::Out.Flush()',
  'while ($true) {',
  '  $line = [Console]::ReadLine()',
  '  if ($null -eq $line) { break }',
  '  $p = $line.Trim() -split "\\s+"',
  '  if ($p.Length -eq 0) { continue }',
  '  try {',
  '    switch ($p[0]) {',
  "      'find' {",
  '        $script:hwnd = Find-MainWindow $p[1] $p[2]',
  '        if ($script:hwnd -ne [IntPtr]::Zero) { "hwnd=" + $script:hwnd.ToInt64() } else { "hwnd=0" }',
  '      }',
  "      'move' {",
  '        if ($script:hwnd -eq [IntPtr]::Zero) { "err nohwnd"; break }',
  '        $script:rect = @([int]$p[1], [int]$p[2], [int]$p[3], [int]$p[4])',
  '        [void][DtmWin]::MoveWindow($script:hwnd, $script:rect[0], $script:rect[1], $script:rect[2], $script:rect[3], $true)',
  '        "ok"',
  '      }',
  "      'show' {",
  '        if ($script:hwnd -eq [IntPtr]::Zero) { "err nohwnd"; break }',
  '        [void][DtmWin]::ShowWindow($script:hwnd, 8)',
  '        if ($script:rect[2] -gt 0) { [void][DtmWin]::MoveWindow($script:hwnd, $script:rect[0], $script:rect[1], $script:rect[2], $script:rect[3], $true) }',
  '        [void][DtmWin]::SetWindowPos($script:hwnd, [IntPtr]::Zero, 0, 0, 0, 0, 0x0013)',
  '        "ok"',
  '      }',
  "      'hide' {",
  '        if ($script:hwnd -eq [IntPtr]::Zero) { "err nohwnd"; break }',
  '        [void][DtmWin]::ShowWindow($script:hwnd, 0)',
  '        "ok"',
  '      }',
  "      'raise' {",
  '        if ($script:hwnd -eq [IntPtr]::Zero) { "err nohwnd"; break }',
  '        if ($script:rect[2] -gt 0) { [void][DtmWin]::MoveWindow($script:hwnd, $script:rect[0], $script:rect[1], $script:rect[2], $script:rect[3], $true) }',
  '        [void][DtmWin]::SetWindowPos($script:hwnd, [IntPtr]::Zero, 0, 0, 0, 0, 0x0013)',
  '        "ok"',
  '      }',
  "      'close' {",
  '        if ($script:hwnd -eq [IntPtr]::Zero) { "err nohwnd"; break }',
  '        [void][DtmWin]::PostMessage($script:hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)',
  '        "ok"',
  '      }',
  "      'quit' {",
  '        "bye"',
  '        break',
  '      }',
  '      default { "err unknown" }',
  '    }',
  '  } catch { "err " + $_.Exception.Message }',
  '  [Console]::Out.Flush()',
  '}',
  ''
].join('\r\n');

/**
 * @param {object} options
 * @param {string} options.dir        where the helper script is written
 * @param {string} options.marker     substring of the window owner's command line
 * @param {string} options.processName executable name, e.g. "chrome.exe"
 */
function createDock({ dir, marker, processName }) {
  let helper = null;
  let ready = null;

  function ensure() {
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
      let scriptPath;
      try {
        fs.mkdirSync(dir, { recursive: true });
        scriptPath = path.join(dir, 'dock-window.ps1');
        fs.writeFileSync(scriptPath, HELPER_SCRIPT, 'utf8');
      } catch (e) { reject(e); return; }

      const powershell = process.env.SystemRoot
        ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
        : 'powershell.exe';
      try {
        helper = spawn(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'ignore']
        });
      } catch (e) { reject(e); return; }

      helper.on('error', (err) => { helper = null; reject(err); });
      helper.on('exit', () => { helper = null; ready = null; });
      helper.stdin.on('error', () => {});

      let buffer = '';
      helper.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        let idx;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (line === 'ready') resolve(true);
        }
      });
      setTimeout(() => reject(new Error('window helper did not start')), 10000).unref();
    });
    return ready;
  }

  function send(command) {
    if (!helper || !helper.stdin.writable) return;
    try { helper.stdin.write(command + '\r\n'); } catch (e) { /* helper died */ }
  }

  async function find() {
    await ensure();
    send('find ' + marker + ' ' + processName);
    // The helper answers asynchronously; give it room to find the window.
    await new Promise((r) => setTimeout(r, 1200));
  }

  function dispose() {
    if (!helper) return;
    try { send('quit'); } catch (e) {}
    try { helper.stdin.end(); } catch (e) {}
    try { helper.kill(); } catch (e) {}
    helper = null;
    ready = null;
  }

  return { ensure, send, find, dispose };
}

module.exports = { createDock };
