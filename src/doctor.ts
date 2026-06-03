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
      // Make the agent actually call the MCP and report the meeting COUNT — a value it
      // cannot produce without a successful tool call. A bare "OK" sentinel would
      // false-positive if the agent printed it despite the call failing. cwd is the vault
      // because the Granola MCP is configured per-project in the vault's .mcp.json.
      // If the MCP needs interactive OAuth it hangs; the timeout reports the auth-hang.
      execFile(
        config.claudeBin,
        ['--dangerously-skip-permissions', '-p',
         'Call mcp__granola__list_meetings with time_range "last_30_days". ' +
         'If the call succeeds, print exactly "PROBE_OK <n>" where <n> is the number of meetings returned. ' +
         'If the granola tools are unavailable or the call errors, print "PROBE_FAIL <reason>". Print nothing else.'],
        { cwd: config.vaultPath, timeout: 60_000, killSignal: 'SIGKILL' },
        (err: (Error & { killed?: boolean }) | null, stdout: string) => {
          if (err?.killed) return resolve({ ok: false, detail: 'timed out — likely needs `claude` → /mcp → approve granola' })
          if (err) return resolve({ ok: false, detail: err.message })
          const ok = /PROBE_OK\s+(\d+)/.exec(stdout)
          if (ok) return resolve({ ok: true, detail: `reachable (${ok[1]} meetings in last 30d)` })
          const fail = /PROBE_FAIL\s+(.*)/.exec(stdout)
          resolve({ ok: false, detail: fail ? fail[1].trim() : 'granola tools not reachable from the vault' })
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
