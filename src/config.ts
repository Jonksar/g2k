import { z } from 'zod'
import os from 'node:os'
import path from 'node:path'
import { readFileSync } from 'node:fs'

export function expandHome(p: string): string {
  if (p === '~') return os.homedir()
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  return p
}

const TimingSchema = z.object({
  debounceMs: z.number().int().positive().default(60_000),
  settleMs: z.number().int().positive().default(180_000),
  captureTimeoutMs: z.number().int().positive().default(1_200_000),
}).default({})

export const ConfigSchema = z.object({
  vaultPath: z.string({ required_error: 'vaultPath is required' }).min(1),
  claudeBin: z.string().default('claude'),
  promptFile: z.string().nullable().default(null),
  watchFile: z.string().default('~/Library/Application Support/Granola/granola.db-wal'),
  outputDir: z.string().default('meetings'),
  commit: z.boolean().default(true),
  timing: TimingSchema,
})

export type Config = z.infer<typeof ConfigSchema>

/** Validate raw config, apply defaults, and expand ~ in path fields. */
export function parseConfig(raw: unknown): Config {
  const cfg = ConfigSchema.parse(raw)
  cfg.vaultPath = expandHome(cfg.vaultPath)
  cfg.watchFile = expandHome(cfg.watchFile)
  if (cfg.promptFile) cfg.promptFile = expandHome(cfg.promptFile)
  if (cfg.claudeBin.startsWith('~')) cfg.claudeBin = expandHome(cfg.claudeBin)
  return cfg
}

/** Default location of the user config file. */
export function configPath(): string {
  return path.join(os.homedir(), '.config', 'g2k', 'config.json')
}

/** Read + parse + validate the config file at the given path (defaults to configPath()). */
export function loadConfig(file: string = configPath()): Config {
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    throw new Error(`No g2k config found at ${file}. Run \`g2k init\` to create one.`)
  }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (err) {
    throw new Error(`Config at ${file} is not valid JSON: ${(err as Error).message}`)
  }
  return parseConfig(json)
}
