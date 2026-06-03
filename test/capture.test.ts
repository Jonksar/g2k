// Journey: the user triggers a capture with `g2k run`.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { run } from '../src/cli.js'
import type { ExecFn } from '../src/capture.js'
import { tmpDir, cleanup, ioCapture, writeConfigFile, writePromptFile } from './helpers.js'

let dir: string
beforeEach(() => { dir = tmpDir() })
afterEach(() => cleanup(dir))

function configWithPrompt(): string {
  const promptFile = writePromptFile(dir, 'vault=$VAULT today=$TODAY commit=$COMMIT')
  return writeConfigFile(dir, {
    vaultPath: '/my/vault',
    claudeBin: '/bin/claude',
    promptFile,
    commit: false,
  })
}

describe('Journey: manual capture', () => {
  it('spawns claude once, in the vault, with a fully-rendered prompt', async () => {
    const cfgPath = configWithPrompt()
    const calls: Array<{ file: string; args: string[]; opts: { cwd: string } }> = []
    const exec: ExecFn = (file, args, opts, cb) => {
      calls.push({ file, args, opts })
      cb(null, 'done', '')
    }

    const c = ioCapture()
    const code = await run(['node', 'g2k', 'run', '--config', cfgPath], { io: c.io, exec })

    expect(code).toBe(0)
    expect(calls).toHaveLength(1)
    expect(calls[0].file).toBe('/bin/claude')
    expect(calls[0].args.slice(0, 2)).toEqual(['--dangerously-skip-permissions', '-p'])
    expect(calls[0].opts.cwd).toBe('/my/vault')

    // The prompt the agent receives has every variable resolved — vault, today's
    // calendar date (not the literal token), and the user's commit setting.
    const prompt = calls[0].args[2]
    expect(prompt).toContain('vault=/my/vault')
    expect(prompt).toContain('commit=false')
    expect(prompt).toMatch(/today=\d{4}-\d{2}-\d{2}/)
    expect(prompt).not.toContain('$TODAY')
  })

  it('surfaces the Granola MCP auth hang when the agent times out', async () => {
    const cfgPath = configWithPrompt()
    const exec: ExecFn = (_file, _args, _opts, cb) => {
      const err = new Error('killed') as Error & { killed?: boolean }
      err.killed = true
      cb(err, '', '')
    }

    const c = ioCapture()
    const code = await run(['node', 'g2k', 'run', '--config', cfgPath], { io: c.io, exec })

    expect(code).toBe(1)
    expect(c.out.join('\n')).toContain('MCP auth hang')
  })
})
