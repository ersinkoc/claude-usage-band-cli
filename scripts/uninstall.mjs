#!/usr/bin/env node
// Removes the usage band from Claude Code's user settings.
//
//   node uninstall.mjs [--dry-run] [--purge] [--keep-settings] [--function-hooks] [--dir <path>]
//
// Edits ~/.claude/settings.json (or $CLAUDE_CONFIG_DIR/settings.json):
//   - takes this plugin's folder out of env.CLAUDE_CODE_PLUGIN_DIRS (the key goes if nothing is left);
//   - deletes pluginConfigs["usage-band"], the saved settings (--keep-settings leaves them);
//   - with --function-hooks, also deletes env.CLAUDE_CODE_ENABLE_FUNCTION_HOOKS. Other mods may
//     need it, so it stays unless asked.
// --purge also deletes the plugin folder itself. --dir names the folder to remove when it isn't
// the one this script lives in. --dry-run prints what would change and writes nothing.
// The old settings.json is copied to settings.json.usage-band.bak before it is rewritten.
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN = 'usage-band'
const PLUGIN_DIRS = 'CLAUDE_CODE_PLUGIN_DIRS'
const FUNCTION_HOOKS = 'CLAUDE_CODE_ENABLE_FUNCTION_HOOKS'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const dryRun = flag('--dry-run')
const purge = flag('--purge')
const keepSettings = flag('--keep-settings')
const dropHooksFlag = flag('--function-hooks')

if (flag('--help') || flag('-h')) {
  process.stdout.write(
    'usage: node uninstall.mjs [--dry-run] [--purge] [--keep-settings] [--function-hooks] [--dir <path>]\n',
  )
  process.exit(0)
}

const dirIndex = args.indexOf('--dir')
if (dirIndex !== -1 && !args[dirIndex + 1]) die('--dir needs a path')

const pluginDir = resolve(dirIndex !== -1 ? args[dirIndex + 1] : join(dirname(fileURLToPath(import.meta.url)), '..'))
const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
const settingsPath = join(configDir, 'settings.json')

function die(message) {
  process.stderr.write(`usage-band uninstall: ${message}\n`)
  process.exit(1)
}

/** A path as it is compared: absolute, no trailing separator, case-folded on Windows and macOS. */
function key(path) {
  const full = resolve(path).replace(/[\\/]+$/, '')
  return process.platform === 'win32' || process.platform === 'darwin' ? full.toLowerCase() : full
}

function isPluginFolder(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, '.claude-plugin', 'plugin.json'), 'utf8')).name === PLUGIN
  } catch {
    return false
  }
}

const done = []

// --- settings.json ---------------------------------------------------------------------------

if (existsSync(settingsPath)) {
  const raw = readFileSync(settingsPath, 'utf8')
  let settings
  try {
    settings = JSON.parse(raw)
  } catch (error) {
    die(`${settingsPath} is not valid JSON (${error.message}); fix it or edit it by hand`)
  }

  let changed = false
  const env = settings.env && typeof settings.env === 'object' ? settings.env : undefined

  if (env && typeof env[PLUGIN_DIRS] === 'string') {
    const entries = env[PLUGIN_DIRS].split(delimiter).filter((entry) => entry.trim() !== '')
    const kept = entries.filter((entry) => key(entry) !== key(pluginDir))
    if (kept.length !== entries.length) {
      if (kept.length > 0) env[PLUGIN_DIRS] = kept.join(delimiter)
      else delete env[PLUGIN_DIRS]
      done.push(`removed ${pluginDir} from env.${PLUGIN_DIRS}`)
      changed = true
    }
  }

  if (dropHooksFlag && env && FUNCTION_HOOKS in env) {
    delete env[FUNCTION_HOOKS]
    done.push(`removed env.${FUNCTION_HOOKS}`)
    changed = true
  }

  if (env && Object.keys(env).length === 0 && changed) delete settings.env

  const configs = settings.pluginConfigs
  if (!keepSettings && configs && typeof configs === 'object' && PLUGIN in configs) {
    delete configs[PLUGIN]
    if (Object.keys(configs).length === 0) delete settings.pluginConfigs
    done.push(`removed pluginConfigs["${PLUGIN}"]`)
    changed = true
  }

  if (changed && !dryRun) {
    const indent = /^\{\r?\n(\s+)"/.exec(raw)?.[1] ?? '  '
    const eol = raw.includes('\r\n') ? '\r\n' : '\n'
    const out = JSON.stringify(settings, null, indent).replace(/\n/g, eol) + (/\r?\n$/.test(raw) ? eol : '')
    copyFileSync(settingsPath, `${settingsPath}.usage-band.bak`)
    writeFileSync(settingsPath, out)
  }
} else {
  process.stdout.write(`no ${settingsPath}, nothing to unregister\n`)
}

// --- the folder ------------------------------------------------------------------------------

if (purge) {
  if (!isPluginFolder(pluginDir)) die(`${pluginDir} is not a ${PLUGIN} plugin folder; not deleting it`)
  const cwd = key(process.cwd())
  const target = key(pluginDir)
  if (cwd === target || cwd.startsWith(target + (process.platform === 'win32' ? '\\' : '/'))) {
    die('run it from outside the plugin folder to delete it')
  }
  if (!dryRun) rmSync(pluginDir, { recursive: true, force: true })
  done.push(`deleted ${pluginDir}`)
}

// --- report ----------------------------------------------------------------------------------

const prefix = dryRun ? 'would have: ' : ''
if (done.length === 0) process.stdout.write('nothing to remove: the usage band is not registered in the user settings\n')
for (const line of done) process.stdout.write(`${prefix}${line}\n`)
if (done.length > 0 && !dryRun) {
  process.stdout.write('\nStart a new Claude Code session; the band is gone from then on.\n')
  if (!dropHooksFlag) {
    process.stdout.write(`env.${FUNCTION_HOOKS} was left alone (other mods may use it; --function-hooks removes it).\n`)
  }
  if (!purge) process.stdout.write(`The folder ${pluginDir} is still there; delete it by hand or re-run with --purge.\n`)
}
