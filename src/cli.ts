#!/usr/bin/env node
import { Command } from 'commander'
import { mkdirSync, writeFileSync, existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { loadConfig, configPath, parseConfig, type Config } from './config.js'
import { startWatcher, type WatchSource } from './watcher.js'
import { runCapture, type ExecFn } from './capture.js'
import { loadPromptTemplate } from './prompt.js'
import { localDate } from './date.js'
import { runChecks, realDoctorDeps, type DoctorDeps } from './doctor.js'
import { installDaemon, uninstallDaemon, defaultLogDir, type PlistOptions } from './daemon/launchd.js'

export interface InitAnswers {
  vaultPath: string
  claudeBin?: string
  promptFile?: string
}

export interface CliIo {
  out: (line: string) => void
  err: (line: string) => void
}

/**
 * Injectable boundaries for the CLI. Every default reaches the real world
 * (console, readline, child_process, launchctl); tests pass fakes to drive
 * a user action end-to-end without side effects.
 */
export interface CliDeps {
  io?: CliIo
  answers?: () => Promise<InitAnswers>
  exec?: ExecFn
  doctorDeps?: DoctorDeps
  createWatcher?: (watchFile: string) => WatchSource
  install?: (opts: PlistOptions) => string
  uninstall?: () => void
  g2kBin?: () => string
}

function resolveG2kBin(): string {
  // Path to the running CLI entry (dist/cli.js, or the npm-global bin symlink). launchd follows symlinks.
  return process.argv[1]
}

async function readlineAnswers(): Promise<InitAnswers> {
  const rl = readline.createInterface({ input: stdin, output: stdout })
  const vaultPath = (await rl.question('Obsidian vault path: ')).trim()
  const claudeBin = (await rl.question('claude binary [claude]: ')).trim() || 'claude'
  const promptFile = (await rl.question('Custom prompt file (blank for bundled default): ')).trim() || undefined
  rl.close()
  return { vaultPath, claudeBin, promptFile }
}

function buildInitConfig(answers: InitAnswers): Config {
  return parseConfig({
    vaultPath: answers.vaultPath,
    claudeBin: answers.claudeBin ?? 'claude',
    promptFile: answers.promptFile ?? null,
  })
}

/**
 * Parse argv and run the matching command. Returns the process exit code.
 * argv is in `process.argv` form (node, script, ...args).
 */
export async function run(argv: string[], deps: CliDeps = {}): Promise<number> {
  const io: CliIo = deps.io ?? { out: (l) => console.log(l), err: (l) => console.error(l) }
  let exitCode = 0

  async function cmdInit(file?: string): Promise<number> {
    const answers = await (deps.answers ?? readlineAnswers)()
    const cfg = buildInitConfig(answers)
    const target = file ?? configPath()
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, JSON.stringify(cfg, null, 2) + '\n')
    io.out(`Wrote config to ${target}`)
    return 0
  }

  function cmdConfig(file?: string): number {
    const target = file ?? configPath()
    if (!existsSync(target)) {
      io.err(`No config at ${target}. Run \`g2k init\`.`)
      return 1
    }
    io.out(readFileSync(target, 'utf8'))
    return 0
  }

  function cmdWatch(file?: string): number {
    const config = loadConfig(file ?? configPath())
    startWatcher(config, { createWatcher: deps.createWatcher, execFn: deps.exec, log: io.out })
    return 0
  }

  async function cmdRun(file?: string): Promise<number> {
    const config = loadConfig(file ?? configPath())
    const template = loadPromptTemplate(config)
    const result = await runCapture(config, { template, today: localDate(), log: io.out, execFn: deps.exec })
    return result.status === 'ok' ? 0 : 1
  }

  function cmdInstall(file?: string): number {
    const cfgPath = file ?? configPath()
    const config = loadConfig(cfgPath) // validate before installing
    const install = deps.install ?? installDaemon
    const g2kBin = (deps.g2kBin ?? resolveG2kBin)()
    // launchd's minimal PATH must be extended so the daemon can find `node` (for the
    // g2k shebang) and `claude` (spawned by the capture).
    const pathDirs = [path.dirname(process.execPath), path.dirname(config.claudeBin)].filter((d) =>
      path.isAbsolute(d),
    )
    const target = install({ g2kBin, configPath: cfgPath, logDir: defaultLogDir(), pathDirs })
    io.out(`Installed and loaded launchd daemon: ${target}`)
    return 0
  }

  function cmdUninstall(): number {
    ;(deps.uninstall ?? uninstallDaemon)()
    io.out('Uninstalled launchd daemon.')
    return 0
  }

  async function cmdDoctor(file?: string): Promise<number> {
    const config = loadConfig(file ?? configPath())
    const checks = await runChecks(config, deps.doctorDeps ?? realDoctorDeps)
    for (const c of checks) io.out(`${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}`)
    return checks.some((c) => !c.ok) ? 1 : 0
  }

  function cmdAuth(): number {
    io.out([
      'Granola auth (one-time):',
      '  1. cd into your vault and run: claude',
      '  2. type: /mcp',
      '  3. approve the `granola` server and complete the OAuth flow in your browser',
      '',
      'The token persists in ~/.claude.json and is reused by headless `claude -p`.',
      'Verify with: g2k doctor',
    ].join('\n'))
    return 0
  }

  // Wrap a handler so loadConfig/IO errors become a guided message + non-zero exit.
  const guard = (fn: (file?: string) => number | Promise<number>) => async (file?: string) => {
    try {
      exitCode = await fn(file)
    } catch (e) {
      io.err((e as Error).message)
      exitCode = 1
    }
  }

  const program = new Command()
  program.name('g2k').description('Granola to Knowledge — capture Granola meetings into an Obsidian vault.')
  const cfgOpt = (c: Command) => c.option('-c, --config <path>', 'config file path')

  cfgOpt(program.command('init').description('create a config file interactively')).action((o) => guard(cmdInit)(o.config))
  cfgOpt(program.command('config').description('print the resolved config')).action((o) => guard(cmdConfig)(o.config))
  cfgOpt(program.command('watch').description('run the watcher in the foreground')).action((o) => guard(cmdWatch)(o.config))
  cfgOpt(program.command('run').description('capture today\'s meetings once, now')).action((o) => guard(cmdRun)(o.config))
  cfgOpt(program.command('install').description('install + load the launchd daemon')).action((o) => guard(cmdInstall)(o.config))
  program.command('uninstall').description('unload + remove the launchd daemon').action(() => guard(cmdUninstall)())
  cfgOpt(program.command('doctor').description('run health checks')).action((o) => guard(cmdDoctor)(o.config))
  program.command('auth').description('print Granola MCP auth instructions').action(() => guard(cmdAuth)())

  await program.parseAsync(argv)
  return exitCode
}

/**
 * True when this module is the program entry point. Resolves argv[1] through any
 * symlink (npm installs `g2k` as a bin symlink) before comparing to this module's
 * URL — a plain string compare would miss the symlink and the CLI would silently
 * do nothing. False when imported by tests.
 */
function invokedDirectly(): boolean {
  if (!process.argv[1]) return false
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
  } catch {
    return false
  }
}

if (invokedDirectly()) {
  run(process.argv).then((code) => {
    process.exitCode = code
  })
}
