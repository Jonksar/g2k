// Journey: the daemon is running and a meeting finishes — it should be captured
// automatically, exactly once, without double-firing.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startWatcher } from '../src/watcher.js'
import type { ExecFn } from '../src/capture.js'
import type { Config } from '../src/config.js'
import { tmpDir, cleanup, writePromptFile } from './helpers.js'

let dir: string
beforeEach(() => {
  dir = tmpDir()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  cleanup(dir)
})

function makeConfig(): Config {
  return {
    vaultPath: '/my/vault',
    claudeBin: '/bin/claude',
    promptFile: writePromptFile(dir, 'capture today'),
    watchFile: '/granola.db-wal',
    outputDir: 'meetings',
    commit: true,
    timing: { debounceMs: 1000, settleMs: 2000, captureTimeoutMs: 1000 },
  }
}

// Minimal stand-in for chokidar's FSWatcher: lets the test emit WAL events.
function fakeWatchSource() {
  const handlers: Record<string, (arg?: unknown) => void> = {}
  const src = {
    on(event: string, handler: (arg?: unknown) => void) {
      handlers[event] = handler
      return src
    },
    fire(event: string, arg?: unknown) {
      handlers[event]?.(arg)
    },
  }
  return src
}

describe('Journey: automatic capture on meeting end', () => {
  it('captures once after the WAL goes quiet (debounce + settle)', async () => {
    const config = makeConfig()
    const exec = vi.fn<ExecFn>((_f, _a, _o, cb) => cb(null, '', ''))
    const src = fakeWatchSource()
    startWatcher(config, { createWatcher: () => src, execFn: exec as unknown as ExecFn, log: () => {} })

    src.fire('change') // a meeting transcript lands
    await vi.advanceTimersByTimeAsync(config.timing.debounceMs)
    expect(exec).not.toHaveBeenCalled() // still settling
    await vi.advanceTimersByTimeAsync(config.timing.settleMs)
    expect(exec).toHaveBeenCalledTimes(1) // captured once
  })

  it('coalesces a burst of WAL writes during the meeting into a single capture', async () => {
    const config = makeConfig()
    const exec = vi.fn<ExecFn>((_f, _a, _o, cb) => cb(null, '', ''))
    const src = fakeWatchSource()
    startWatcher(config, { createWatcher: () => src, execFn: exec as unknown as ExecFn, log: () => {} })

    src.fire('change')
    await vi.advanceTimersByTimeAsync(500)
    src.fire('change') // resets the debounce — meeting still ongoing
    await vi.advanceTimersByTimeAsync(500)
    expect(exec).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(config.timing.debounceMs + config.timing.settleMs)
    expect(exec).toHaveBeenCalledTimes(1)
  })

  it('does not start a second capture while one is already running', async () => {
    const config = makeConfig()
    let release: ((err: null, out: string, errOut: string) => void) | undefined
    const exec = vi.fn<ExecFn>((_f, _a, _o, cb) => { release = cb }) // hold the capture open
    const src = fakeWatchSource()
    startWatcher(config, { createWatcher: () => src, execFn: exec as unknown as ExecFn, log: () => {} })

    src.fire('change')
    await vi.advanceTimersByTimeAsync(config.timing.debounceMs + config.timing.settleMs)
    expect(exec).toHaveBeenCalledTimes(1) // capture #1 in flight

    src.fire('change') // more activity arrives mid-capture
    await vi.advanceTimersByTimeAsync(config.timing.debounceMs + config.timing.settleMs)
    expect(exec).toHaveBeenCalledTimes(1) // not double-fired

    release?.(null, '', '')
    await vi.runAllTimersAsync()
  })
})
