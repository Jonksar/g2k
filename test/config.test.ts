import { describe, it, expect } from 'vitest'
import { ConfigSchema, expandHome, parseConfig } from '../src/config.js'
import os from 'node:os'

describe('expandHome', () => {
  it('expands a leading ~ to the home directory', () => {
    expect(expandHome('~/foo')).toBe(`${os.homedir()}/foo`)
  })
  it('leaves absolute paths unchanged', () => {
    expect(expandHome('/abs/path')).toBe('/abs/path')
  })
})

describe('ConfigSchema / parseConfig', () => {
  it('applies defaults when only vaultPath is given', () => {
    const cfg = parseConfig({ vaultPath: '/v' })
    expect(cfg.claudeBin).toBe('claude')
    expect(cfg.promptFile).toBeNull()
    expect(cfg.outputDir).toBe('meetings')
    expect(cfg.commit).toBe(true)
    expect(cfg.timing.debounceMs).toBe(60000)
    expect(cfg.timing.settleMs).toBe(180000)
    expect(cfg.timing.captureTimeoutMs).toBe(1200000)
  })

  it('expands ~ in path fields', () => {
    const cfg = parseConfig({ vaultPath: '~/vault', promptFile: '~/p.md' })
    expect(cfg.vaultPath).toBe(`${os.homedir()}/vault`)
    expect(cfg.promptFile).toBe(`${os.homedir()}/p.md`)
  })

  it('throws a clear error when vaultPath is missing', () => {
    expect(() => parseConfig({})).toThrow(/vaultPath/)
  })

  it('overrides individual timing fields while keeping the rest defaulted', () => {
    const cfg = parseConfig({ vaultPath: '/v', timing: { debounceMs: 5 } })
    expect(cfg.timing.debounceMs).toBe(5)
    expect(cfg.timing.settleMs).toBe(180000)
  })
})
