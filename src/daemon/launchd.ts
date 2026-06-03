import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'

export const LAUNCHD_LABEL = 'com.g2k.watcher'

export interface PlistOptions {
  g2kBin: string
  configPath: string
  logDir: string
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
  execFileSync('launchctl', ['load', target])
  return target
}

/** Unload the daemon and remove its plist. */
export function uninstallDaemon(): void {
  const target = plistPath()
  if (existsSync(target)) {
    try {
      execFileSync('launchctl', ['unload', target])
    } catch {
      // already unloaded — ignore
    }
    rmSync(target)
  }
}
