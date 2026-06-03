#!/usr/bin/env node
import { Command } from 'commander'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { loadConfig, configPath, parseConfig, type Config } from './config.js'
import { startWatcher } from './watcher.js'
import { runCapture } from './capture.js'
import { loadPromptTemplate } from './prompt.js'
import { localDate } from './date.js'
import { runChecks } from './doctor.js'
import { installDaemon, uninstallDaemon, defaultLogDir } from './daemon/launchd.js'

/** Build a config object from init answers and validate it through the schema. */
export function buildInitConfig(answers: { vaultPath: string; claudeBin?: string; promptFile?: string }): Config {
  return parseConfig({
    vaultPath: answers.vaultPath,
    claudeBin: answers.claudeBin ?? 'claude',
    promptFile: answers.promptFile ?? null,
  })
}

function resolveG2kBin(): string {
  // Path to the running CLI entry (dist/cli.js, or the npm-global bin symlink). launchd follows symlinks.
  return process.argv[1]
}

async function cmdInit(): Promise<void> {
  const rl = readline.createInterface({ input: stdin, output: stdout })
  const vaultPath = (await rl.question('Obsidian vault path: ')).trim()
  const claudeBin = (await rl.question('claude binary [claude]: ')).trim() || 'claude'
  const promptFile = (await rl.question('Custom prompt file (blank for bundled default): ')).trim() || undefined
  rl.close()
  const cfg = buildInitConfig({ vaultPath, claudeBin, promptFile })
  const target = configPath()
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, JSON.stringify(cfg, null, 2) + '\n')
  console.log(`Wrote config to ${target}`)
}

function cmdConfig(file?: string): void {
  const target = file ?? configPath()
  if (!existsSync(target)) {
    console.error(`No config at ${target}. Run \`g2k init\`.`)
    process.exitCode = 1
    return
  }
  console.log(readFileSync(target, 'utf8'))
}

function cmdWatch(file?: string): void {
  const config = loadConfig(file ?? configPath())
  startWatcher(config)
}

async function cmdRun(file?: string): Promise<void> {
  const config = loadConfig(file ?? configPath())
  const template = loadPromptTemplate(config)
  const result = await runCapture(config, { template, today: localDate(), log: (m) => console.log(m) })
  if (result.status !== 'ok') process.exitCode = 1
}

function cmdInstall(file?: string): void {
  const cfgPath = file ?? configPath()
  loadConfig(cfgPath) // validate before installing
  const target = installDaemon({ g2kBin: resolveG2kBin(), configPath: cfgPath, logDir: defaultLogDir() })
  console.log(`Installed and loaded launchd daemon: ${target}`)
}

function cmdUninstall(): void {
  uninstallDaemon()
  console.log('Uninstalled launchd daemon.')
}

async function cmdDoctor(file?: string): Promise<void> {
  const config = loadConfig(file ?? configPath())
  const checks = await runChecks(config)
  for (const c of checks) {
    console.log(`${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}`)
  }
  if (checks.some((c) => !c.ok)) process.exitCode = 1
}

function cmdAuth(): void {
  console.log([
    'Granola auth (one-time):',
    '  1. cd into your vault and run: claude',
    '  2. type: /mcp',
    '  3. approve the `granola` server and complete the OAuth flow in your browser',
    '',
    'The token persists in ~/.claude.json and is reused by headless `claude -p`.',
    'Verify with: g2k doctor',
  ].join('\n'))
}

function main(): void {
  const program = new Command()
  program.name('g2k').description('Granola to Knowledge — capture Granola meetings into an Obsidian vault.')
  const cfgOpt = (c: Command) => c.option('-c, --config <path>', 'config file path')

  cfgOpt(program.command('init').description('create a config file interactively')).action(() => cmdInit())
  cfgOpt(program.command('config').description('print the resolved config')).action((o) => cmdConfig(o.config))
  cfgOpt(program.command('watch').description('run the watcher in the foreground')).action((o) => cmdWatch(o.config))
  cfgOpt(program.command('run').description('capture today\'s meetings once, now')).action((o) => cmdRun(o.config))
  cfgOpt(program.command('install').description('install + load the launchd daemon')).action((o) => cmdInstall(o.config))
  program.command('uninstall').description('unload + remove the launchd daemon').action(() => cmdUninstall())
  cfgOpt(program.command('doctor').description('run health checks')).action((o) => cmdDoctor(o.config))
  program.command('auth').description('print Granola MCP auth instructions').action(() => cmdAuth())

  program.parse()
}

// Only run the CLI when executed directly, not when imported by tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main()
}
