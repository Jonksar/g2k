// Journey: the user installs/uninstalls the background daemon.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { run } from '../src/cli.js'
import type { PlistOptions } from '../src/daemon/launchd.js'
import { tmpDir, cleanup, ioCapture, writeConfigFile } from './helpers.js'

let dir: string
beforeEach(() => { dir = tmpDir() })
afterEach(() => cleanup(dir))

describe('Journey: install the daemon', () => {
  it('registers the daemon pointing at my config and the g2k binary', async () => {
    const cfgPath = writeConfigFile(dir, { vaultPath: '/my/vault', claudeBin: '/bin/claude' })
    let captured: PlistOptions | undefined
    const c = ioCapture()

    const code = await run(['node', 'g2k', 'install', '--config', cfgPath], {
      io: c.io,
      g2kBin: () => '/usr/local/bin/g2k',
      install: (opts) => {
        captured = opts
        return '/Users/somebody/Library/LaunchAgents/com.g2k.watcher.plist'
      },
    })

    expect(code).toBe(0)
    expect(captured?.configPath).toBe(cfgPath)
    expect(captured?.g2kBin).toBe('/usr/local/bin/g2k')
    expect(c.out.join('\n')).toContain('Installed')
  })

  it('install fails with a guided error when the config is missing', async () => {
    const c = ioCapture()
    let installCalled = false
    const code = await run(['node', 'g2k', 'install', '--config', `${dir}/missing.json`], {
      io: c.io,
      install: () => { installCalled = true; return '' },
    })

    expect(code).toBe(1)
    expect(installCalled).toBe(false) // never tries to install against a missing config
    expect(c.err.join('\n')).toMatch(/g2k init|No g2k config/)
  })
})

describe('Journey: uninstall the daemon', () => {
  it('removes the daemon and confirms', async () => {
    const c = ioCapture()
    let uninstalled = false
    const code = await run(['node', 'g2k', 'uninstall'], {
      io: c.io,
      uninstall: () => { uninstalled = true },
    })

    expect(code).toBe(0)
    expect(uninstalled).toBe(true)
    expect(c.out.join('\n')).toContain('Uninstalled')
  })
})
