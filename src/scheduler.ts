export interface SchedulerOptions {
  debounceMs: number
  settleMs: number
  onCapture: () => Promise<void> | void
  log?: (msg: string) => void
}

/**
 * Debounce → settle → capture state machine with a concurrency guard.
 * - notifyChange() restarts the debounce timer.
 * - After `debounceMs` of silence, a `settleMs` timer starts (lets Granola finish its summary).
 * - When settle elapses, capture runs — unless one is already in flight, in which case it is skipped
 *   (the running capture scans all of today's meetings anyway, so nothing is missed).
 */
export class CaptureScheduler {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private settleTimer: ReturnType<typeof setTimeout> | null = null
  private inFlight = false
  private readonly log: (msg: string) => void

  constructor(private readonly opts: SchedulerOptions) {
    this.log = opts.log ?? (() => {})
  }

  get isInFlight(): boolean {
    return this.inFlight
  }

  notifyChange(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    if (this.settleTimer) clearTimeout(this.settleTimer)
    this.debounceTimer = setTimeout(() => {
      this.log(`quiet for ${this.opts.debounceMs / 1000}s — settling ${this.opts.settleMs / 1000}s`)
      this.settleTimer = setTimeout(() => void this.fire(), this.opts.settleMs)
    }, this.opts.debounceMs)
  }

  private async fire(): Promise<void> {
    if (this.inFlight) {
      this.log('capture already in flight — skipping this trigger')
      return
    }
    this.inFlight = true
    try {
      await this.opts.onCapture()
    } finally {
      this.inFlight = false
    }
  }
}
