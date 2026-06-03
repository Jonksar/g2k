import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { loadPromptTemplate } from './prompt.js'
import type { Config } from './config.js'

export interface Check {
  name: string
  ok: boolean
  detail: string
}

export interface DoctorDeps {
  pathExists: (p: string) => boolean
  canReadPrompt: (config: Config) => boolean
  probeMcp: (config: Config) => Promise<{ ok: boolean; detail?: string }>
}

export const realDoctorDeps: DoctorDeps = {
  pathExists: (p) => existsSync(p),
  canReadPrompt: (config) => {
    try {
      loadPromptTemplate(config)
      return true
    } catch {
      return false
    }
  },
  probeMcp: (config) =>
    new Promise((resolve) => {
      // Ask the agent to list meetings and print a sentinel. If the MCP needs interactive
      // OAuth it will hang; the timeout then reports the known auth-hang failure mode.
      execFile(
        config.claudeBin,
        ['--dangerously-skip-permissions', '-p',
         'Call mcp__granola__list_meetings for today and then print exactly PROBE_OK. Print nothing else.'],
        { cwd: config.vaultPath, timeout: 60_000, killSignal: 'SIGKILL' },
        (err: (Error & { killed?: boolean }) | null, stdout: string) => {
          if (err?.killed) return resolve({ ok: false, detail: 'timed out — likely needs `claude` → /mcp → approve granola' })
          if (err) return resolve({ ok: false, detail: err.message })
          const matched = /PROBE_OK/.test(stdout)
          resolve({ ok: matched, detail: matched ? 'reachable' : 'no sentinel returned' })
        },
      )
    }),
}

export async function runChecks(config: Config, deps: DoctorDeps = realDoctorDeps): Promise<Check[]> {
  const checks: Check[] = []
  checks.push({ name: 'vault', ok: deps.pathExists(config.vaultPath), detail: config.vaultPath })
  checks.push({ name: 'claude-bin', ok: deps.pathExists(config.claudeBin) || config.claudeBin === 'claude', detail: config.claudeBin })
  checks.push({ name: 'watch-file', ok: deps.pathExists(config.watchFile), detail: config.watchFile })
  checks.push({ name: 'prompt', ok: deps.canReadPrompt(config), detail: config.promptFile ?? '(bundled default)' })
  const mcp = await deps.probeMcp(config)
  checks.push({ name: 'granola-mcp', ok: mcp.ok, detail: mcp.detail ?? '' })
  return checks
}
