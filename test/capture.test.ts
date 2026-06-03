import { describe, it, expect } from 'vitest'
import { runCapture, type ExecFn } from '../src/capture.js'
import type { Config } from '../src/config.js'

const baseConfig: Config = {
  vaultPath: '/vault',
  claudeBin: '/bin/claude',
  promptFile: null,
  watchFile: '/wal',
  outputDir: 'meetings',
  commit: true,
  timing: { debounceMs: 1, settleMs: 1, captureTimeoutMs: 1000 },
}

describe('runCapture', () => {
  it('invokes claude with the rendered prompt and resolves on success', async () => {
    const calls: Array<{ file: string; args: string[]; opts: any }> = []
    const fakeExec: ExecFn = (file, args, opts, cb) => {
      calls.push({ file, args, opts })
      cb(null, 'done', '')
    }
    const result = await runCapture(baseConfig, {
      execFn: fakeExec,
      template: 'vault=$VAULT day=$TODAY',
      today: '2026-06-03',
    })
    expect(result.status).toBe('ok')
    expect(calls[0].file).toBe('/bin/claude')
    expect(calls[0].args[0]).toBe('--dangerously-skip-permissions')
    expect(calls[0].args[1]).toBe('-p')
    expect(calls[0].args[2]).toBe('vault=/vault day=2026-06-03')
    expect(calls[0].opts.cwd).toBe('/vault')
    expect(calls[0].opts.timeout).toBe(1000)
    expect(calls[0].opts.killSignal).toBe('SIGKILL')
  })

  it('reports a timeout kill distinctly', async () => {
    const fakeExec: ExecFn = (_f, _a, _o, cb) => {
      const err = new Error('killed') as NodeJS.ErrnoException & { killed?: boolean }
      err.killed = true
      cb(err, '', '')
    }
    const result = await runCapture(baseConfig, {
      execFn: fakeExec, template: 'x', today: '2026-06-03',
    })
    expect(result.status).toBe('killed')
  })

  it('reports a generic error', async () => {
    const fakeExec: ExecFn = (_f, _a, _o, cb) => cb(new Error('boom'), '', '')
    const result = await runCapture(baseConfig, {
      execFn: fakeExec, template: 'x', today: '2026-06-03',
    })
    expect(result.status).toBe('error')
    expect(result.message).toContain('boom')
  })
})
