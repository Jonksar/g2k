import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CaptureScheduler } from '../src/scheduler.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function makeScheduler(onCapture: () => Promise<void> | void) {
  return new CaptureScheduler({ debounceMs: 1000, settleMs: 2000, onCapture })
}

describe('CaptureScheduler', () => {
  it('fires capture after debounce + settle of silence', async () => {
    const onCapture = vi.fn()
    const s = makeScheduler(onCapture)
    s.notifyChange()
    await vi.advanceTimersByTimeAsync(1000) // debounce elapses → settle starts
    expect(onCapture).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000) // settle elapses → capture
    expect(onCapture).toHaveBeenCalledTimes(1)
  })

  it('coalesces rapid changes into a single capture', async () => {
    const onCapture = vi.fn()
    const s = makeScheduler(onCapture)
    s.notifyChange()
    await vi.advanceTimersByTimeAsync(500)
    s.notifyChange() // resets debounce
    await vi.advanceTimersByTimeAsync(500)
    expect(onCapture).not.toHaveBeenCalled() // debounce restarted, not yet elapsed
    await vi.advanceTimersByTimeAsync(500 + 2000)
    expect(onCapture).toHaveBeenCalledTimes(1)
  })

  it('skips a new capture while one is in flight', async () => {
    let resolveCapture!: () => void
    const onCapture = vi.fn(() => new Promise<void>((r) => { resolveCapture = r }))
    const s = makeScheduler(onCapture)
    s.notifyChange()
    await vi.advanceTimersByTimeAsync(3000) // capture #1 starts and is pending
    expect(onCapture).toHaveBeenCalledTimes(1)
    expect(s.isInFlight).toBe(true)

    s.notifyChange() // arrives mid-flight
    await vi.advanceTimersByTimeAsync(3000) // would-be capture #2 fires...
    expect(onCapture).toHaveBeenCalledTimes(1) // ...but is skipped

    resolveCapture()
    await vi.runAllTimersAsync()
    expect(s.isInFlight).toBe(false)
  })
})
