// Journey: the user checks their setup health with `g2k doctor`.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { run } from '../src/cli.js'
import { tmpDir, cleanup, ioCapture, writeConfigFile } from './helpers.js'

let dir: string
beforeEach(() => { dir = tmpDir() })
afterEach(() => cleanup(dir))

describe('Journey: health check', () => {
  it('reports everything healthy and exits 0 when the setup is wired', async () => {
    const cfgPath = writeConfigFile(dir, { vaultPath: '/my/vault', claudeBin: '/bin/claude' })
    const c = ioCapture()
    const code = await run(['node', 'g2k', 'doctor', '--config', cfgPath], {
      io: c.io,
      doctorDeps: {
        pathExists: () => true,
        canReadPrompt: () => true,
        probeMcp: async () => ({ ok: true, detail: 'reachable' }),
      },
    })

    expect(code).toBe(0)
    const out = c.out.join('\n')
    expect(out).toContain('✓ vault')
    expect(out).toContain('✓ granola-mcp')
  })

  it('flags a missing vault and an unauthenticated MCP, and exits non-zero', async () => {
    const cfgPath = writeConfigFile(dir, { vaultPath: '/nope/vault', claudeBin: '/bin/claude' })
    const c = ioCapture()
    const code = await run(['node', 'g2k', 'doctor', '--config', cfgPath], {
      io: c.io,
      doctorDeps: {
        pathExists: (p) => !p.startsWith('/nope'),
        canReadPrompt: () => true,
        probeMcp: async () => ({ ok: false, detail: 'timed out — likely needs `claude` → /mcp → approve granola' }),
      },
    })

    expect(code).toBe(1)
    const out = c.out.join('\n')
    expect(out).toContain('✗ vault')
    expect(out).toContain('✗ granola-mcp')
    expect(out).toContain('/mcp') // the user is told how to re-authenticate
  })
})
