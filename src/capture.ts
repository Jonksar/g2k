import { execFile as nodeExecFile } from 'node:child_process'
import { renderPrompt } from './prompt.js'
import type { Config } from './config.js'

/** Minimal callback signature we depend on from child_process.execFile (injectable for tests). */
export type ExecFn = (
  file: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv; maxBuffer: number; timeout: number; killSignal: NodeJS.Signals },
  cb: (err: (Error & { killed?: boolean }) | null, stdout: string, stderr: string) => void,
) => void

export interface CaptureDeps {
  execFn?: ExecFn
  template: string
  today: string
  log?: (msg: string) => void
}

export interface CaptureResult {
  status: 'ok' | 'killed' | 'error'
  message?: string
  durationMs: number
}

const defaultExec = nodeExecFile as unknown as ExecFn

/** Render the prompt and spawn `claude --dangerously-skip-permissions -p <prompt>` in the vault. */
export function runCapture(config: Config, deps: CaptureDeps): Promise<CaptureResult> {
  const execFn = deps.execFn ?? defaultExec
  const log = deps.log ?? (() => {})
  const prompt = renderPrompt(deps.template, {
    vault: config.vaultPath,
    today: deps.today,
    outputDir: config.outputDir,
    commit: config.commit,
  })
  const startedAt = Date.now()
  log('spawning capture agent...')
  return new Promise<CaptureResult>((resolve) => {
    execFn(
      config.claudeBin,
      ['--dangerously-skip-permissions', '-p', prompt],
      {
        cwd: config.vaultPath,
        env: { ...process.env, OBSIDIAN_VAULT_PATH: config.vaultPath },
        maxBuffer: 10 * 1024 * 1024,
        timeout: config.timing.captureTimeoutMs,
        killSignal: 'SIGKILL',
      },
      (err, stdout) => {
        const durationMs = Date.now() - startedAt
        if (err?.killed) {
          log(`capture KILLED after ${Math.round(durationMs / 1000)}s (timeout) — likely Granola MCP auth hang`)
          resolve({ status: 'killed', durationMs })
        } else if (err) {
          log(`capture error: ${err.message}`)
          resolve({ status: 'error', message: err.message, durationMs })
        } else {
          if (stdout?.trim()) log(stdout.trim())
          log(`capture done in ${Math.round(durationMs / 1000)}s`)
          resolve({ status: 'ok', durationMs })
        }
      },
    )
  })
}
