import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Config } from './config.js'

export interface PromptVars {
  vault: string
  today: string
  outputDir: string
  commit: boolean
}

/** Substitute $VAULT / $TODAY / $OUTPUT_DIR / $COMMIT tokens. Unknown $TOKENS are left as-is. */
export function renderPrompt(template: string, vars: PromptVars): string {
  return template
    .replace(/\$VAULT\b/g, vars.vault)
    .replace(/\$TODAY\b/g, vars.today)
    .replace(/\$OUTPUT_DIR\b/g, vars.outputDir)
    .replace(/\$COMMIT\b/g, String(vars.commit))
}

/** Path to the bundled generic prompt shipped with the package. */
export function bundledPromptPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.join(here, 'prompts', 'default.md')
}

/** Read the override prompt (config.promptFile) if set, else the bundled default. */
export function loadPromptTemplate(config: Config): string {
  const file = config.promptFile ?? bundledPromptPath()
  try {
    return readFileSync(file, 'utf8')
  } catch (err) {
    throw new Error(`Cannot read prompt file ${file}: ${(err as Error).message}`)
  }
}
