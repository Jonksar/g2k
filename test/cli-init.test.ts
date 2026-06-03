import { describe, it, expect } from 'vitest'
import { buildInitConfig } from '../src/cli.js'

describe('buildInitConfig', () => {
  it('produces a config object that parses against the schema', () => {
    const cfg = buildInitConfig({ vaultPath: '/v', claudeBin: '/bin/claude' })
    expect(cfg.vaultPath).toBe('/v')
    expect(cfg.claudeBin).toBe('/bin/claude')
    expect(cfg.outputDir).toBe('meetings')
    expect(cfg.commit).toBe(true)
  })
})
