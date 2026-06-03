import { describe, it, expect } from 'vitest'
import { renderPlist, LAUNCHD_LABEL } from '../src/daemon/launchd.js'

describe('renderPlist', () => {
  const plist = renderPlist({
    g2kBin: '/usr/local/bin/g2k',
    configPath: '/home/me/.config/g2k/config.json',
    logDir: '/home/me/Library/Logs/g2k',
  })

  it('uses the g2k label', () => {
    expect(plist).toContain(`<string>${LAUNCHD_LABEL}</string>`)
  })
  it('execs the g2k binary with the watch subcommand and config flag', () => {
    expect(plist).toContain('<string>/usr/local/bin/g2k</string>')
    expect(plist).toContain('<string>watch</string>')
    expect(plist).toContain('<string>--config</string>')
    expect(plist).toContain('<string>/home/me/.config/g2k/config.json</string>')
  })
  it('points stdout and stderr at the log dir', () => {
    expect(plist).toContain('/home/me/Library/Logs/g2k/watcher.log')
    expect(plist).toContain('/home/me/Library/Logs/g2k/watcher.err.log')
  })
  it('keeps the daemon alive and runs at load', () => {
    expect(plist).toContain('<key>KeepAlive</key>')
    expect(plist).toContain('<key>RunAtLoad</key>')
  })
  it('contains no hardcoded /Users/ paths beyond the injected ones', () => {
    const matches = plist.match(/\/Users\//g) ?? []
    expect(matches.length).toBe(0)
  })
})
