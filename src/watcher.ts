import chokidar from 'chokidar'
import { CaptureScheduler } from './scheduler.js'
import { runCapture } from './capture.js'
import { loadPromptTemplate } from './prompt.js'
import type { Config } from './config.js'

function log(msg: string): void {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`)
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

/** Start watching the Granola WAL and capture on meeting end. Runs until the process exits. */
export function startWatcher(config: Config): void {
  const scheduler = new CaptureScheduler({
    debounceMs: config.timing.debounceMs,
    settleMs: config.timing.settleMs,
    log,
    onCapture: async () => {
      const template = loadPromptTemplate(config)
      await runCapture(config, { template, today: today(), log })
    },
  })

  log(`watching ${config.watchFile}`)
  log(`debounce ${config.timing.debounceMs / 1000}s → settle ${config.timing.settleMs / 1000}s → capture`)

  chokidar
    .watch(config.watchFile, {
      // Poll, not fsevents: the WAL is checkpointed (truncated/recreated), which silently
      // kills a single-file fsevents watch. Polling re-stats by name and survives checkpoints.
      usePolling: true,
      interval: 5_000,
      binaryInterval: 5_000,
      awaitWriteFinish: { stabilityThreshold: 2_000, pollInterval: 500 },
      // disableGlobbing removed: chokidar v4 dropped globbing entirely; single-path watching is the default.
    })
    .on('change', () => scheduler.notifyChange())
    .on('add', () => log('WAL appeared — watching'))
    .on('unlink', () => log('WAL removed (checkpoint) — will re-watch on add'))
    .on('error', (err: unknown) => log(`watcher error: ${(err as Error).message}`))
}
