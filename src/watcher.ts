import chokidar from 'chokidar'
import { CaptureScheduler } from './scheduler.js'
import { runCapture, type ExecFn } from './capture.js'
import { loadPromptTemplate } from './prompt.js'
import { localDate } from './date.js'
import type { Config } from './config.js'

/** The slice of a file watcher we depend on — satisfied by chokidar's FSWatcher and by test fakes. */
export interface WatchSource {
  on(event: 'change' | 'add' | 'unlink' | 'error', handler: (arg?: unknown) => void): WatchSource
}

export interface WatcherDeps {
  /** Create the underlying watcher for a path. Defaults to a polling chokidar watch. */
  createWatcher?: (watchFile: string) => WatchSource
  /** Process spawner threaded into the capture. Defaults to the real child_process.execFile. */
  execFn?: ExecFn
  /** Log sink. Defaults to timestamped stdout. */
  log?: (msg: string) => void
}

function defaultLog(msg: string): void {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`)
}

function defaultCreateWatcher(watchFile: string): WatchSource {
  return chokidar.watch(watchFile, {
    // Poll, not fsevents: the WAL is checkpointed (truncated/recreated), which silently
    // kills a single-file fsevents watch. Polling re-stats by name and survives checkpoints.
    usePolling: true,
    interval: 5_000,
    binaryInterval: 5_000,
    awaitWriteFinish: { stabilityThreshold: 2_000, pollInterval: 500 },
  }) as unknown as WatchSource
}

/** Start watching the Granola WAL and capture on meeting end. Runs until the process exits. */
export function startWatcher(config: Config, deps: WatcherDeps = {}): void {
  const log = deps.log ?? defaultLog
  const createWatcher = deps.createWatcher ?? defaultCreateWatcher

  const scheduler = new CaptureScheduler({
    debounceMs: config.timing.debounceMs,
    settleMs: config.timing.settleMs,
    log,
    onCapture: async () => {
      const template = loadPromptTemplate(config)
      await runCapture(config, { template, today: localDate(), log, execFn: deps.execFn })
    },
  })

  log(`watching ${config.watchFile}`)
  log(`debounce ${config.timing.debounceMs / 1000}s → settle ${config.timing.settleMs / 1000}s → capture`)

  createWatcher(config.watchFile)
    .on('change', () => scheduler.notifyChange())
    .on('add', () => log('WAL appeared — watching'))
    .on('unlink', () => log('WAL removed (checkpoint) — will re-watch on add'))
    .on('error', (err) => log(`watcher error: ${(err as Error).message}`))
}
