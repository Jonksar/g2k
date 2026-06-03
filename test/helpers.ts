// Shared helpers for journey tests — real temp filesystem, captured IO, no global mutation.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { CliIo } from '../src/cli.js'

export function tmpDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'g2k-'))
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}

/** A CliIo that records everything written, so a journey can assert what the user saw. */
export function ioCapture(): { io: CliIo; out: string[]; err: string[] } {
  const out: string[] = []
  const err: string[] = []
  return { io: { out: (l) => out.push(l), err: (l) => err.push(l) }, out, err }
}

export function writeConfigFile(dir: string, cfg: Record<string, unknown>): string {
  const p = path.join(dir, 'config.json')
  writeFileSync(p, JSON.stringify(cfg, null, 2))
  return p
}

export function writePromptFile(dir: string, content: string): string {
  const p = path.join(dir, 'prompt.md')
  writeFileSync(p, content)
  return p
}
