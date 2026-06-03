import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'

export const LAUNCHD_LABEL = 'com.g2k.watcher'

export interface PlistOptions {
  g2kBin: string
  configPath: string
  logDir: string
  /**
   * Directories to prepend to the daemon's PATH. launchd runs with a minimal PATH
   * that excludes Homebrew etc., so without this the `#!/usr/bin/env node` shebang in
   * the g2k bin — and the `claude` it spawns — fail with "env: node: No such file".
   */
  pathDirs?: string[]
}

/** PATH for the daemon: caller-provided dirs (node/claude) first, then system defaults. */
function daemonPath(pathDirs: string[] = []): string {
  const dirs = [...pathDirs, '/usr/local/bin', '/usr/bin', '/bin'].filter(Boolean)
  return Array.from(new Set(dirs)).join(':')
}

export function renderPlist(opts: PlistOptions): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LAUNCHD_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${opts.g2kBin}</string>
        <string>watch</string>
        <string>--config</string>
        <string>${opts.configPath}</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${daemonPath(opts.pathDirs)}</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${path.join(opts.logDir, 'watcher.log')}</string>
    <key>StandardErrorPath</key>
    <string>${path.join(opts.logDir, 'watcher.err.log')}</string>
    <key>ProcessType</key>
    <string>Background</string>
    <key>ThrottleInterval</key>
    <integer>10</integer>
</dict>
</plist>
`
}

export function plistPath(): string {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`)
}

export function defaultLogDir(): string {
  return path.join(os.homedir(), 'Library', 'Logs', 'g2k')
}

/** Write the plist and load it into launchd. */
export function installDaemon(opts: PlistOptions): string {
  mkdirSync(opts.logDir, { recursive: true })
  const target = plistPath()
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, renderPlist(opts))
  try {
    // Best-effort: clear any prior load so re-install is idempotent. stdio ignored
    // because unloading a not-yet-loaded plist prints a harmless I/O error.
    execFileSync('launchctl', ['unload', target], { stdio: 'ignore' })
  } catch {
    // not currently loaded — fine
  }
  execFileSync('launchctl', ['load', target])
  return target
}

/** Unload the daemon and remove its plist. */
export function uninstallDaemon(): void {
  const target = plistPath()
  if (existsSync(target)) {
    try {
      execFileSync('launchctl', ['unload', target], { stdio: 'ignore' })
    } catch {
      // already unloaded — ignore
    }
    rmSync(target)
  }
}
