// Journey: a new user sets up g2k, and is guided when things are missing.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { run } from '../src/cli.js'
import { tmpDir, cleanup, ioCapture } from './helpers.js'

let dir: string
beforeEach(() => { dir = tmpDir() })
afterEach(() => cleanup(dir))

describe('Journey: first-time setup', () => {
  it('init writes a config that config then reads back', async () => {
    const cfgPath = path.join(dir, 'config.json')

    // The user runs `g2k init` and answers the prompts.
    const setup = ioCapture()
    const initCode = await run(['node', 'g2k', 'init', '--config', cfgPath], {
      io: setup.io,
      answers: async () => ({ vaultPath: '/my/vault', claudeBin: '/bin/claude' }),
    })
    expect(initCode).toBe(0)
    expect(setup.out.join('\n')).toContain('Wrote config')
    expect(existsSync(cfgPath)).toBe(true)

    // Later the user runs `g2k config` and sees their settings.
    const show = ioCapture()
    const configCode = await run(['node', 'g2k', 'config', '--config', cfgPath], { io: show.io })
    expect(configCode).toBe(0)
    expect(show.out.join('\n')).toContain('/my/vault')

    // The persisted config is valid and carries the chosen values.
    const persisted = JSON.parse(readFileSync(cfgPath, 'utf8'))
    expect(persisted.vaultPath).toBe('/my/vault')
    expect(persisted.claudeBin).toBe('/bin/claude')
  })
})

describe('Journey: setup mistakes are guided', () => {
  it('config without a config file tells the user to run init', async () => {
    const c = ioCapture()
    const code = await run(['node', 'g2k', 'config', '--config', path.join(dir, 'missing.json')], { io: c.io })
    expect(code).toBe(1)
    expect(c.err.join('\n')).toContain('g2k init')
  })

  it('run without a config file fails with a guided error, not a stack trace', async () => {
    const c = ioCapture()
    const code = await run(['node', 'g2k', 'run', '--config', path.join(dir, 'missing.json')], { io: c.io })
    expect(code).toBe(1)
    expect(c.err.join('\n')).toMatch(/g2k init|No g2k config/)
  })
})

describe('Journey: auth guidance', () => {
  it('auth prints the one-time Granola /mcp instructions', async () => {
    const c = ioCapture()
    const code = await run(['node', 'g2k', 'auth'], { io: c.io })
    expect(code).toBe(0)
    const printed = c.out.join('\n')
    expect(printed).toContain('/mcp')
    expect(printed).toContain('granola')
  })
})
