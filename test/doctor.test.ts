import { describe, it, expect } from 'vitest'
import { runChecks, type DoctorDeps } from '../src/doctor.js'
import type { Config } from '../src/config.js'

const config: Config = {
  vaultPath: '/vault',
  claudeBin: '/bin/claude',
  promptFile: null,
  watchFile: '/wal',
  outputDir: 'meetings',
  commit: true,
  timing: { debounceMs: 1, settleMs: 1, captureTimeoutMs: 1000 },
}

function deps(over: Partial<DoctorDeps> = {}): DoctorDeps {
  return {
    pathExists: () => true,
    canReadPrompt: () => true,
    probeMcp: async () => ({ ok: true }),
    ...over,
  }
}

describe('runChecks', () => {
  it('returns all-ok when everything resolves', async () => {
    const checks = await runChecks(config, deps())
    expect(checks.every((c) => c.ok)).toBe(true)
    expect(checks.map((c) => c.name)).toContain('granola-mcp')
  })

  it('flags a missing vault', async () => {
    const checks = await runChecks(config, deps({ pathExists: (p) => p !== '/vault' }))
    const vault = checks.find((c) => c.name === 'vault')!
    expect(vault.ok).toBe(false)
  })

  it('flags an MCP auth hang', async () => {
    const checks = await runChecks(config, deps({ probeMcp: async () => ({ ok: false, detail: 'timed out' }) }))
    const mcp = checks.find((c) => c.name === 'granola-mcp')!
    expect(mcp.ok).toBe(false)
    expect(mcp.detail).toContain('timed out')
  })
})
