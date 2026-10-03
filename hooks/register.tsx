import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  PluginOptions,
  Register,
  SessionContextUsage,
  SessionCost,
  SessionRateLimit,
} from 'claude-code'

import type {
  UsageBandAlerted,
  UsageBandChurn,
  UsageBandContext,
  UsageBandGit,
  UsageBandLimit,
  UsageBandMemory,
  UsageBandSpeed,
  UsageBandTokens,
  UsageBandTools,
  UsageBandTurns,
} from '../types'
import {
  POWERLINE_BG,
  POWERLINE_FG,
  TERMINAL_TONES,
  barColor,
  baseName,
  cacheHitPercent,
  churnPill,
  contextPill,
  costPill,
  durationPill,
  effortPill,
  elapsedFraction,
  folderPill,
  formatGiB,
  formatLeft,
  formatPercent,
  formatShort,
  formatTokens,
  formatUsd,
  gitPill,
  level,
  limitPill,
  memoryPill,
  modelPill,
  prettyModel,
  projectedPercent,
  speedPill,
  terminalBar,
  tokenPills,
  toolsPill,
  turnsPill,
  windowOf,
} from './pills'
import type { LimitKind, Look, Pill, Tone } from './pills'

// ---------------------------------------------------------------- state

const EMPTY_TOKENS: UsageBandTokens = { input: 0, cacheWrite: 0, output: 0, cacheRead: 0, requests: 0, isEstimate: true }
const EMPTY_TOOLS: UsageBandTools = { total: 0, byTool: {}, isEstimate: true }
const EMPTY_TURNS: UsageBandTurns = { count: 0, lastMs: 0, totalMs: 0, timed: 0 }
const NO_ALERTS: UsageBandAlerted = { fiveHour: 0, sevenDay: 0, spend: 0 }

const fiveHour = atom({ plugin: 'usage-band', key: 'fiveHour' } as const, null)
const sevenDay = atom({ plugin: 'usage-band', key: 'sevenDay' } as const, null)
const spendLimit = atom({ plugin: 'usage-band', key: 'spendLimit' } as const, null)
const contextAtom = atom({ plugin: 'usage-band', key: 'context' } as const, null)
const costUsd = atom({ plugin: 'usage-band', key: 'costUsd' } as const, null)
const startedAtAtom = atom({ plugin: 'usage-band', key: 'startedAt' } as const, null)
const tokensAtom = atom({ plugin: 'usage-band', key: 'tokens' } as const, null)
const estimate = atom({ plugin: 'usage-band', key: 'estimate' } as const, EMPTY_TOKENS)
const toolsAtom = atom({ plugin: 'usage-band', key: 'tools' } as const, null)
const liveTools = atom({ plugin: 'usage-band', key: 'liveTools' } as const, EMPTY_TOOLS)
const churnAtom = atom({ plugin: 'usage-band', key: 'churn' } as const, null)
const turnsAtom = atom({ plugin: 'usage-band', key: 'turns' } as const, EMPTY_TURNS)
const modelAtom = atom({ plugin: 'usage-band', key: 'model' } as const, null)
const effortAtom = atom({ plugin: 'usage-band', key: 'effort' } as const, null)
const cwdAtom = atom({ plugin: 'usage-band', key: 'cwd' } as const, null)
const gitAtom = atom({ plugin: 'usage-band', key: 'git' } as const, null)
const speedAtom = atom({ plugin: 'usage-band', key: 'speed' } as const, null)
const memoryAtom = atom({ plugin: 'usage-band', key: 'memory' } as const, null)
const alertedAtom = atom({ plugin: 'usage-band', key: 'alerted' } as const, NO_ALERTS)
const nowAtom = atom({ plugin: 'usage-band', key: 'now' } as const, 0)
const isHidden = atom({ plugin: 'usage-band', key: 'isHidden' } as const, false)

// ---------------------------------------------------------------- settings

/** Each pill (or pill extra) and the userConfig field that turns it on, by the name /usage-band on|off takes. */
const TOGGLES = {
  '5h': 'show5h',
  '7d': 'show7d',
  spend: 'showSpendLimit',
  pace: 'showPace',
  context: 'showContext',
  input: 'showInput',
  output: 'showOutput',
  cache: 'showCacheRead',
  hit: 'showCacheHit',
  speed: 'showSpeed',
  cost: 'showCost',
  burn: 'showBurnRate',
  tools: 'showTools',
  churn: 'showChurn',
  model: 'showModel',
  effort: 'showEffort',
  folder: 'showFolder',
  git: 'showGit',
  memory: 'showMemory',
  duration: 'showDuration',
  turns: 'showTurns',
  terminal: 'showInTerminal',
  nerd: 'nerdFont',
  alerts: 'alerts',
} as const

type Toggle = keyof typeof TOGGLES
type ToggleField = (typeof TOGGLES)[Toggle]

const ALIASES: Record<string, Toggle> = {
  ctx: 'context',
  in: 'input',
  out: 'output',
  cacheread: 'cache',
  cachehit: 'hit',
  tps: 'speed',
  rate: 'burn',
  lines: 'churn',
  thinking: 'effort',
  cwd: 'folder',
  dir: 'folder',
  branch: 'git',
  mem: 'memory',
  time: 'duration',
  session: 'duration',
  weekly: '7d',
}

const NUMBERS = { warn: 'warnAt', hot: 'hotAt', refresh: 'refreshSeconds' } as const

type Settings = {
  on: Record<ToggleField, boolean>
  look: Look
  refreshMs: number
  terminalStyle: 'powerline' | 'plain'
  nerd: boolean
}

function readSettings(options: PluginOptions): Settings {
  const on = {} as Record<ToggleField, boolean>
  for (const field of Object.values(TOGGLES)) on[field] = options[field] !== false
  // nerd is a toggle for the command; Settings.nerd is what the drawing reads
  const num = (key: string, fallback: number, min: number, max: number) => {
    const v = Number(options[key] ?? fallback)
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
  }
  const warnAt = num('warnAt', 70, 1, 100)
  const hotAt = Math.max(warnAt, num('hotAt', 90, 1, 100))
  return {
    on,
    look: { warnAt, hotAt, isCompact: options.layout === 'compact' },
    refreshMs: num('refreshSeconds', 30, 10, 600) * 1000,
    terminalStyle: options.terminalStyle === 'plain' ? 'plain' : 'powerline',
    nerd: options.nerdFont !== false,
  }
}

// Module state: lost on reload, which only costs one recount.
let settings: Settings = readSettings({})
let nodePath: string | null = null
let isScriptBroken = false
let counted: { path: string; size: number; mtimeMs: number } | null = null
let counting: Promise<void> | null = null

const NODE_CANDIDATES = ['node', '/usr/local/bin/node', '/opt/homebrew/bin/node']

type Engine = EngineInterface

// ---------------------------------------------------------------- reading the engine

function toLimit(windows: SessionRateLimit[], kind: string): UsageBandLimit | null {
  const found = windows.find(w => w.kind === kind)
  if (found === undefined) return null
  const resetsAtMs = found.resetsAt === undefined ? NaN : Date.parse(found.resetsAt)
  return { percentUsed: found.percentUsed, resetsAtMs: Number.isNaN(resetsAtMs) ? null : resetsAtMs }
}

function toContext(context: SessionContextUsage): UsageBandContext {
  return { tokens: context.tokens ?? null, window: context.window, percent: context.percent ?? null }
}

const ALERT_NAMES: Record<keyof UsageBandAlerted, string> = {
  fiveHour: '5-hour limit',
  sevenDay: '7-day limit',
  spend: 'Spend limit',
}

async function alertOnCross($: Engine, which: keyof UsageBandAlerted, limit: UsageBandLimit, now: number): Promise<void> {
  const reached = level(limit.percentUsed, settings.look)
  const before = (await read($, alertedAtom))[which]
  if (reached === before) return
  await update($, alertedAtom, prev => ({ ...prev, [which]: reached }))
  if (!settings.on.alerts || reached < before) return
  const left = limit.resetsAtMs === null ? '' : `, resets in ${formatLeft(limit.resetsAtMs - now)}`
  $.ui.toast(`${reached === 2 ? '⚠ ' : ''}${ALERT_NAMES[which]} at ${formatPercent(limit.percentUsed)}${left}`, {
    timeoutMs: reached === 2 ? 10_000 : 6000,
  })
}

async function applyMeasure(
  $: Engine,
  rateLimits: SessionRateLimit[],
  context: SessionContextUsage,
  cost: SessionCost | undefined,
): Promise<void> {
  const now = await $.clock.now()
  // Limits appear after the first model response; until then the pills stay hidden.
  const five = toLimit(rateLimits, 'five_hour')
  const seven = toLimit(rateLimits, 'seven_day')
  const spend = toLimit(rateLimits, 'spend_limit')
  if (five !== null) {
    await update($, fiveHour, () => five)
    await alertOnCross($, 'fiveHour', five, now)
  }
  if (seven !== null) {
    await update($, sevenDay, () => seven)
    await alertOnCross($, 'sevenDay', seven, now)
  }
  if (spend !== null) {
    await update($, spendLimit, () => spend)
    await alertOnCross($, 'spend', spend, now)
  }
  await update($, contextAtom, () => toContext(context))
  if (cost !== undefined) await update($, costUsd, () => cost.usd)
}

async function runNode($: Engine, script: string, args: string[]): Promise<string | null> {
  const path = `${$.plugin.root}/scripts/${script}`
  const candidates = nodePath === null ? NODE_CANDIDATES : [nodePath]
  for (const node of candidates) {
    try {
      const ran = await $.process.run([node, path, ...args], { timeoutMs: 20_000 })
      if (ran.exitCode === 0) {
        nodePath = node
        return ran.stdout
      }
    } catch {
      // not found here; try the next one
    }
  }
  return null
}

function lastJsonLine(stdout: string): unknown {
  try {
    return JSON.parse(stdout.trim().split('\n').pop() ?? '{}')
  } catch {
    return null
  }
}

type ScriptResult = {
  ok: boolean
  path?: string
  size?: number
  mtimeMs?: number
  input?: number
  cacheWrite?: number
  output?: number
  cacheRead?: number
  requests?: number
  tools?: { total: number; byTool: Record<string, number> }
  churn?: UsageBandChurn
  model?: string | null
}

async function countTokens($: Engine): Promise<void> {
  if (isScriptBroken) return
  if (counted !== null) {
    const stat = await $.fs.stat(counted.path).catch(() => null)
    if (stat !== null && stat.size === counted.size && stat.mtimeMs === counted.mtimeMs) return
  }
  const sessionId = await $.session.id()
  const stdout = await runNode($, 'tokens.mjs', [sessionId])
  if (stdout === null) {
    isScriptBroken = true
    return
  }
  const parsed = lastJsonLine(stdout) as ScriptResult | null
  // A transcript not written yet (a brand-new session) is no failure: try again later.
  if (parsed === null || !parsed.ok || parsed.path === undefined) return
  counted = { path: parsed.path, size: parsed.size ?? 0, mtimeMs: parsed.mtimeMs ?? 0 }
  const tokens: UsageBandTokens = {
    input: parsed.input ?? 0,
    cacheWrite: parsed.cacheWrite ?? 0,
    output: parsed.output ?? 0,
    cacheRead: parsed.cacheRead ?? 0,
    requests: parsed.requests ?? 0,
    isEstimate: false,
  }
  await update($, tokensAtom, () => tokens)
  const tools = parsed.tools
  if (tools !== undefined) await update($, toolsAtom, () => ({ ...tools, isEstimate: false }))
  const churn = parsed.churn
  if (churn !== undefined) await update($, churnAtom, () => churn)
  const model = parsed.model
  if (typeof model === 'string' && (await read($, modelAtom)) === null) await update($, modelAtom, () => model)
}

function refreshTokens($: Engine): Promise<void> {
  if (counting === null) {
    counting = countTokens($)
      .catch(() => undefined)
      .finally(() => {
        counting = null
      })
  }
  return counting
}

async function readGit($: Engine, cwd: string): Promise<UsageBandGit> {
  const notRepo: UsageBandGit = { isRepo: false, branch: null, dirty: 0 }
  try {
    const inside = await $.process.run(['git', 'rev-parse', '--is-inside-work-tree'], { cwd, timeoutMs: 8000 })
    if (inside.exitCode !== 0 || inside.stdout.trim() !== 'true') return notRepo
    let branch: string | null = (await $.process.run(['git', 'branch', '--show-current'], { cwd, timeoutMs: 8000 })).stdout.trim()
    if (branch === '') {
      const sha = await $.process.run(['git', 'rev-parse', '--short', 'HEAD'], { cwd, timeoutMs: 8000 })
      branch = sha.exitCode === 0 ? `@${sha.stdout.trim()}` : null
    }
    const status = await $.process.run(['git', 'status', '--porcelain'], { cwd, timeoutMs: 8000 })
    const dirty = status.exitCode === 0 ? status.stdout.split('\n').filter(l => l.trim() !== '').length : 0
    return { isRepo: true, branch, dirty }
  } catch {
    return notRepo
  }
}

async function readMemory($: Engine): Promise<UsageBandMemory | null> {
  const stdout = await runNode($, 'sysinfo.mjs', [])
  const parsed = stdout === null ? null : (lastJsonLine(stdout) as { total?: number; free?: number } | null)
  if (parsed === null || typeof parsed.total !== 'number' || typeof parsed.free !== 'number') return null
  return { total: parsed.total, free: parsed.free }
}

async function refreshSession($: Engine): Promise<void> {
  const cwd = await $.session.cwd()
  await update($, cwdAtom, () => cwd)
  const count = await $.session.turns()
  await update($, turnsAtom, prev => ({ ...prev, count }))
  if ((await read($, modelAtom)) === null) {
    const model = await $.session.model()
    await update($, modelAtom, () => model)
  }
  if (settings.on.showGit) {
    const git = await readGit($, cwd)
    await update($, gitAtom, () => git)
  }
  if (settings.on.showMemory) {
    const memory = await readMemory($)
    if (memory !== null) await update($, memoryAtom, () => memory)
  }
}

async function refreshAll($: Engine): Promise<void> {
  const now = await $.clock.now()
  await update($, nowAtom, () => now)
  const usage = await $.session.usage()
  await update($, startedAtAtom, () => usage.startedAt)
  await applyMeasure($, usage.rateLimits, usage.context, usage.cost)
  await Promise.all([refreshTokens($), refreshSession($).catch(() => undefined)])
}

async function recordSpeed($: Engine, tokens: number, ms: number): Promise<void> {
  await update($, speedAtom, prev => ({
    lastTps: (tokens / ms) * 1000,
    tokens: (prev?.tokens ?? 0) + tokens,
    ms: (prev?.ms ?? 0) + ms,
    requests: (prev?.requests ?? 0) + 1,
  }))
}

async function countTool($: Engine, tool: string): Promise<void> {
  await update($, liveTools, prev => ({
    total: prev.total + 1,
    byTool: { ...prev.byTool, [tool]: (prev.byTool[tool] ?? 0) + 1 },
    isEstimate: true,
  }))
}

// ---------------------------------------------------------------- the command

async function setOption($: Engine, field: string, value: boolean | number | string): Promise<string | null> {
  const rows = await $.config.list()
  const row =
    rows.find(r => r.key === `usage-band.${field}`) ??
    rows.find(r => r.key.startsWith('usage-band') && r.key.endsWith(`.${field}`))
  if (row === undefined) {
    return `No settings row for ${field}; set pluginConfigs["usage-band"].options.${field} in ~/.claude/settings.json.`
  }
  const done = await $.config.set({ key: row.key, value })
  return done.deny === undefined ? null : `${field}: ${done.deny}`
}

const SETTINGS_HELP = [
  'Pills: /usage-band on|off <name…>  (or "all")',
  `  names: ${Object.keys(TOGGLES).join(', ')}`,
  'Layout: /usage-band set layout full|compact',
  'Terminal: /usage-band set style powerline|plain · /usage-band off nerd (text labels instead of Nerd Font icons)',
  'Thresholds: /usage-band set warn <1-100> · /usage-band set hot <1-100>',
  'Refresh: /usage-band set refresh <10-600 seconds>',
  'Or open /config and search "Usage band".',
].join('\n')

function describeSettings(): string {
  const on = Object.entries(TOGGLES)
    .map(([name, field]) => `${settings.on[field] ? '●' : '○'} ${name}`)
    .join('  ')
  const { look } = settings
  return [
    on,
    `layout ${look.isCompact ? 'compact' : 'full'} · terminal ${settings.terminalStyle}${settings.nerd ? ' + Nerd Font' : ''} · yellow ${look.warnAt}% · red ${look.hotAt}% · refresh ${settings.refreshMs / 1000}s`,
    '',
    SETTINGS_HELP,
  ].join('\n')
}

async function runSettingsCommand($: Engine, verb: string, rest: string[]): Promise<string> {
  if (verb === 'on' || verb === 'off') {
    const names = rest.length === 1 && rest[0] === 'all' ? Object.keys(TOGGLES) : rest
    if (names.length === 0) return `Name what to turn ${verb}.\n${SETTINGS_HELP}`
    const unknown: string[] = []
    const fields: ToggleField[] = []
    for (const raw of names) {
      const name = ALIASES[raw] ?? raw
      const field = name in TOGGLES ? TOGGLES[name as Toggle] : undefined
      if (field === undefined) unknown.push(raw)
      else fields.push(field)
    }
    if (unknown.length > 0) return `Unknown: ${unknown.join(', ')}.\n${SETTINGS_HELP}`
    for (const field of fields) {
      const failed = await setOption($, field, verb === 'on')
      if (failed !== null) return failed
    }
    return `Turned ${verb}: ${names.join(', ')}. The band reloads with the new settings.`
  }
  // verb === 'set'
  const [name, value] = rest
  if (name === 'layout') {
    if (value !== 'full' && value !== 'compact') return 'Layout is full or compact.'
    return (await setOption($, 'layout', value)) ?? `Layout set to ${value}.`
  }
  if (name === 'style') {
    if (value !== 'powerline' && value !== 'plain') return 'Style is powerline or plain.'
    return (await setOption($, 'terminalStyle', value)) ?? `Terminal style set to ${value}.`
  }
  const field = name !== undefined && name in NUMBERS ? NUMBERS[name as keyof typeof NUMBERS] : undefined
  const n = Number(value)
  if (field === undefined || value === undefined || !Number.isFinite(n)) return SETTINGS_HELP
  return (await setOption($, field, n)) ?? `${name} set to ${n}.`
}

async function summary($: Engine): Promise<string> {
  const now = await read($, nowAtom)
  const parts: string[] = []
  const limits: [string, UsageBandLimit | null][] = [
    ['5h', await read($, fiveHour)],
    ['7d', await read($, sevenDay)],
    ['spend', await read($, spendLimit)],
  ]
  for (const [name, limit] of limits) {
    if (limit === null) continue
    parts.push(
      `${name} ${formatPercent(limit.percentUsed)}` +
        (limit.resetsAtMs === null ? '' : ` (${formatLeft(limit.resetsAtMs - now)})`),
    )
  }
  const context = await read($, contextAtom)
  if (context !== null && context.tokens !== null) {
    parts.push(`ctx ${formatTokens(context.tokens)}/${formatTokens(context.window)}`)
  }
  const tokens = (await read($, tokensAtom)) ?? (await read($, estimate))
  if (tokens.requests > 0 || !tokens.isEstimate) {
    const mark = tokens.isEstimate ? '~' : ''
    parts.push(
      `in ${mark}${formatTokens(tokens.input + tokens.cacheWrite)}`,
      `out ${mark}${formatTokens(tokens.output)}`,
      `cache ${mark}${formatTokens(tokens.cacheRead)}`,
    )
  }
  const cost = await read($, costUsd)
  if (cost !== null) parts.push(formatUsd(cost))
  const tools = (await read($, toolsAtom)) ?? (await read($, liveTools))
  if (tools.total > 0) parts.push(`${tools.total} tools`)
  const churn = await read($, churnAtom)
  if (churn !== null && churn.added + churn.removed > 0) parts.push(`+${churn.added} −${churn.removed}`)
  const model = await read($, modelAtom)
  if (model !== null) parts.push(prettyModel(model))
  const effort = await read($, effortAtom)
  if (effort !== null) parts.push(`thinking ${effort}`)
  return parts.length === 0 ? 'No usage data yet (it arrives after the first model response).' : parts.join(' · ')
}

// ---------------------------------------------------------------- the band's content

type Band = {
  now: number
  limits: { kind: LimitKind; limit: UsageBandLimit }[]
  context: UsageBandContext | null
  tokens: UsageBandTokens | null
  speed: UsageBandSpeed | null
  cost: number | null
  perHour: number | null
  tools: UsageBandTools | null
  churn: UsageBandChurn | null
  model: string | null
  effort: string | null
  cwd: string | null
  git: UsageBandGit | null
  sessionMs: number | null
  turns: UsageBandTurns | null
  memory: UsageBandMemory | null
}

async function readBand($: Engine): Promise<Band> {
  const { on } = settings
  const now = (await read($, nowAtom)) || (await $.clock.now())
  const limits: Band['limits'] = []
  const five = await read($, fiveHour)
  const seven = await read($, sevenDay)
  const spend = await read($, spendLimit)
  if (on.show5h && five !== null) limits.push({ kind: '5h', limit: five })
  if (on.show7d && seven !== null) limits.push({ kind: '7d', limit: seven })
  if (on.showSpendLimit && spend !== null) limits.push({ kind: 'spend', limit: spend })

  const counted = await read($, tokensAtom)
  const est = await read($, estimate)
  const tokens = counted ?? (est.requests > 0 ? est : null)
  const anyToken = on.showInput || on.showOutput || on.showCacheRead

  const startedAt = await read($, startedAtAtom)
  const sessionMs = startedAt === null ? null : Math.max(0, now - startedAt)
  const cost = await read($, costUsd)
  const perHour =
    on.showBurnRate && cost !== null && sessionMs !== null && sessionMs >= 5 * 60_000
      ? cost / (sessionMs / 3_600_000)
      : null

  const tools = (await read($, toolsAtom)) ?? (await read($, liveTools))
  const churn = await read($, churnAtom)
  const turns = await read($, turnsAtom)

  return {
    now,
    limits,
    context: on.showContext ? await read($, contextAtom) : null,
    tokens: anyToken ? tokens : null,
    speed: on.showSpeed ? await read($, speedAtom) : null,
    cost: on.showCost ? cost : null,
    perHour,
    tools: on.showTools && tools.total > 0 ? tools : null,
    churn: on.showChurn && churn !== null && churn.added + churn.removed > 0 ? churn : null,
    model: on.showModel ? await read($, modelAtom) : null,
    effort: on.showEffort ? await read($, effortAtom) : null,
    cwd: on.showFolder ? await read($, cwdAtom) : null,
    git: on.showGit ? await read($, gitAtom) : null,
    sessionMs: on.showDuration ? sessionMs : null,
    turns: on.showTurns && turns.count > 0 ? turns : null,
    memory: on.showMemory ? await read($, memoryAtom) : null,
  }
}

function present<T>(list: (T | null)[]): T[] {
  return list.filter((x): x is T => x !== null)
}

/** The SVG pills in their groups: limits · context · tokens · cost · work · session. */
function pillGroups(band: Band): Pill[][] {
  const { on, look } = settings
  return [
    band.limits.map(({ kind, limit }) => limitPill(kind, limit, band.now, look, on.showPace)),
    present([band.context === null ? null : contextPill(band.context, look)]),
    [
      ...(band.tokens === null
        ? []
        : tokenPills(band.tokens, band.context, look, {
            input: on.showInput,
            output: on.showOutput,
            cacheRead: on.showCacheRead,
            cacheHit: on.showCacheHit,
          })),
      ...present([band.speed === null ? null : speedPill(band.speed, look)]),
    ],
    present([band.cost === null ? null : costPill(band.cost, band.context, look, band.perHour)]),
    present([
      band.tools === null ? null : toolsPill(band.tools, look),
      band.churn === null ? null : churnPill(band.churn, look),
    ]),
    present([
      band.model === null ? null : modelPill(band.model, look),
      band.effort === null ? null : effortPill(band.effort, look),
      band.cwd === null ? null : folderPill(band.cwd, look),
      band.git === null ? null : gitPill(band.git, look),
      band.sessionMs === null ? null : durationPill(band.sessionMs, look),
      band.turns === null ? null : turnsPill(band.turns, look),
      band.memory === null ? null : memoryPill(band.memory, look),
    ]),
  ].filter(group => group.length > 0)
}

/** One run of text inside a terminal pill, with its own color and weight. */
type Run = { text: string; color?: string; bold?: boolean; dim?: boolean }

/** One terminal pill: its tone, its Nerd Font icon, the label used without one, and its runs. */
type TermPill = { tone: Tone; icon: string; label: string; runs: Run[]; line?: Line }

/** The terminal band's three lines: limits, context and cost · tokens and work · the session. */
type Line = 1 | 2 | 3

/** Nerd Font glyphs (Font Awesome, Octicons and Devicons ranges of the Basic Multilingual Plane). */
const NERD = {
  '5h': '',
  '7d': '',
  spend: '',
  reset: '',
  ctx: '',
  in: '',
  out: '',
  cache: '',
  speed: '',
  cost: '',
  tools: '',
  churn: '',
  model: '',
  effort: '',
  folder: '',
  git: '',
  up: '',
  turns: '',
  mem: '',
} as const

/** Powerline glyphs: the rounded caps that open and close a chain, the arrow and the thin arrow between segments. */
const PL = { open: '', close: '', arrow: '', thin: '' } as const

function termBar(percent: number, elapsed: number | null, markerColor: string): Run[] {
  if (settings.look.isCompact) return []
  const runs = terminalBar(percent, elapsed).map(
    (run): Run =>
      run.kind === 'fill'
        ? { text: run.text, color: barColor(percent, settings.look) }
        : run.kind === 'marker'
          ? { text: run.text, color: markerColor }
          : { text: run.text, dim: true },
  )
  return [...runs, { text: ' ' }]
}

function termGroups(band: Band): TermPill[][] {
  const { on } = settings
  const isPowerline = settings.terminalStyle === 'powerline'
  // On a colored segment the text is light; on the plain band it takes the tone's hue.
  const ink = (t: Tone) => (isPowerline ? POWERLINE_FG : TERMINAL_TONES[t])
  const groups: TermPill[][] = []
  const push = (line: Line, list: TermPill[]) => groups.push(list.map(pill => ({ ...pill, line })))

  push(1, 
    band.limits.map((one): TermPill => {
      const { kind, limit } = one
      const t: Tone = kind === '5h' ? 'teal' : kind === '7d' ? 'purple' : 'rose'
      const windowMs = windowOf(kind)
      const elapsed = windowMs === null ? null : elapsedFraction(limit, windowMs, band.now)
      const projected = on.showPace ? projectedPercent(limit.percentUsed, elapsed) : null
      const runs: Run[] = [
        ...termBar(limit.percentUsed, elapsed, ink(t)),
        { text: formatPercent(limit.percentUsed), bold: true, color: ink(t) },
      ]
      if (projected !== null) {
        runs.push({ text: ` →${formatPercent(projected)}`, color: barColor(projected, settings.look) })
      }
      if (limit.resetsAtMs !== null) {
        const gap = settings.nerd ? ` ${NERD.reset} ` : ' · '
        runs.push({ text: `${gap}${formatLeft(limit.resetsAtMs - band.now)}`, color: ink(t), dim: true })
      }
      return { tone: t, icon: NERD[kind], label: kind, runs }
    }),
  )

  const context = band.context
  if (context !== null && context.tokens !== null) {
    const percent = context.percent ?? (context.tokens / context.window) * 100
    push(1, [
      {
        tone: 'indigo',
        icon: NERD.ctx,
        label: 'ctx',
        runs: [
          ...termBar(percent, null, ink('indigo')),
          { text: formatPercent(percent), bold: true, color: ink('indigo') },
          { text: ` · ${formatTokens(context.tokens)}/${formatTokens(context.window)}`, color: ink('indigo'), dim: true },
        ],
      },
    ])
  }

  const tokenRow: TermPill[] = []
  if (band.tokens !== null) {
    const t = band.tokens
    const mark = t.isEstimate ? '~' : ''
    if (on.showInput) {
      tokenRow.push({
        tone: 'red',
        icon: NERD.in,
        label: '↑',
        runs: [{ text: `${mark}${formatTokens(t.input + t.cacheWrite)}`, color: ink('red') }],
      })
    }
    if (on.showOutput) {
      tokenRow.push({
        tone: 'green',
        icon: NERD.out,
        label: '↓',
        runs: [{ text: `${mark}${formatTokens(t.output)}`, color: ink('green') }],
      })
    }
    if (on.showCacheRead) {
      const hit = on.showCacheHit ? cacheHitPercent(t) : null
      tokenRow.push({
        tone: 'blue',
        icon: NERD.cache,
        label: '≡',
        runs: [
          { text: `${mark}${formatTokens(t.cacheRead)}`, color: ink('blue') },
          ...(hit === null ? [] : [{ text: ` · ${formatPercent(hit)}`, color: ink('blue'), dim: true }]),
        ],
      })
    }
  }
  if (band.speed !== null) {
    tokenRow.push({
      tone: 'lime',
      icon: NERD.speed,
      label: '»',
      runs: [{ text: `${band.speed.lastTps.toFixed(1)} t/s`, color: ink('lime') }],
    })
  }
  push(2, tokenRow)

  if (band.cost !== null) {
    push(1, [
      {
        tone: 'gold',
        icon: NERD.cost,
        label: '',
        runs: [
          { text: formatUsd(band.cost), color: ink('gold'), bold: isPowerline },
          ...(band.perHour === null ? [] : [{ text: ` · ${formatUsd(band.perHour)}/h`, color: ink('gold'), dim: true }]),
        ],
      },
    ])
  }

  const work: TermPill[] = []
  if (band.tools !== null) {
    work.push({
      tone: 'orange',
      icon: NERD.tools,
      label: 'tools',
      runs: [{ text: `${band.tools.isEstimate ? '~' : ''}${band.tools.total}`, color: ink('orange') }],
    })
  }
  if (band.churn !== null) {
    work.push({
      tone: 'slate',
      icon: NERD.churn,
      label: '',
      runs: [
        { text: `+${band.churn.added}`, color: isPowerline ? '#9be39f' : TERMINAL_TONES.green },
        { text: ` −${band.churn.removed}`, color: isPowerline ? '#f5a49c' : TERMINAL_TONES.red },
      ],
    })
  }
  push(2, work)

  const meta: TermPill[] = []
  if (band.model !== null) {
    meta.push({ tone: 'slate', icon: NERD.model, label: '', runs: [{ text: prettyModel(band.model), color: ink('slate') }] })
  }
  if (band.effort !== null) {
    meta.push({ tone: 'pink', icon: NERD.effort, label: 'think', runs: [{ text: band.effort, color: ink('pink') }] })
  }
  if (band.cwd !== null) {
    meta.push({ tone: 'slate', icon: NERD.folder, label: '', runs: [{ text: baseName(band.cwd), color: ink('slate') }] })
  }
  if (band.git !== null) {
    const git = band.git
    meta.push({
      tone: 'slate',
      icon: NERD.git,
      label: '⎇',
      runs: git.isRepo
        ? [
            { text: git.branch ?? 'detached', color: ink('slate') },
            ...(git.dirty > 0 ? [{ text: ` ±${git.dirty}`, color: isPowerline ? '#f3d27a' : TERMINAL_TONES.gold }] : []),
          ]
        : [{ text: 'no git', color: ink('slate'), dim: true }],
    })
  }
  if (band.sessionMs !== null) {
    meta.push({ tone: 'slate', icon: NERD.up, label: 'up', runs: [{ text: formatLeft(band.sessionMs), color: ink('slate') }] })
  }
  if (band.turns !== null) {
    const turns = band.turns
    meta.push({
      tone: 'slate',
      icon: NERD.turns,
      label: '',
      runs: [
        { text: `${turns.count} turns`, color: ink('slate') },
        ...(turns.timed > 0 ? [{ text: ` · ${formatShort(turns.lastMs)}`, color: ink('slate'), dim: true }] : []),
      ],
    })
  }
  if (band.memory !== null) {
    const used = band.memory.total - band.memory.free
    const percent = band.memory.total === 0 ? 0 : (used / band.memory.total) * 100
    meta.push({
      tone: 'cyan',
      icon: NERD.mem,
      label: 'mem',
      runs: [
        ...termBar(percent, null, ink('cyan')),
        { text: `${formatGiB(used)}/${formatGiB(band.memory.total)}`, color: ink('cyan'), dim: !isPowerline },
      ],
    })
  }
  push(3, meta)

  return groups.filter(group => group.length > 0)
}

/** A pill's head: its icon with a Nerd Font, else its text label (nothing when it has none). */
function head(pill: TermPill): string {
  if (settings.nerd) return `${pill.icon} `
  return pill.label === '' ? '' : `${pill.label} `
}

const PLAIN_GAP = '  '

/** Cells a string takes: one per code point (the band's glyphs, Nerd Font icons included, are single width). */
function cells(text: string): number {
  return [...text].length
}

/** Cells one pill takes in a row: its joint, padding, head and runs (powerline), or its gap, head and runs (plain). */
function pillCells(pill: TermPill, isPowerline: boolean, isFirst: boolean): number {
  const body = cells(head(pill)) + pill.runs.reduce((sum, run) => sum + cells(run.text), 0)
  if (isPowerline) return 1 + 1 + body + 1
  return (isFirst ? 0 : PLAIN_GAP.length) + body
}

/** Cells a whole row takes, the closing cap included. */
function rowCells(row: TermPill[], isPowerline: boolean): number {
  return row.reduce((sum, pill, i) => sum + pillCells(pill, isPowerline, i === 0), 0) + (isPowerline ? 1 : 0)
}

/** Splits the pills, in order, into `k` rows so the widest row is as narrow as it can be. */
function balance(pills: TermPill[], k: number, isPowerline: boolean): TermPill[][] {
  const n = pills.length
  if (n <= k) return pills.map(pill => [pill])
  const width = (from: number, to: number) => rowCells(pills.slice(from, to), isPowerline)
  // best[j][i]: the narrowest widest row splitting the first i pills into j rows; cut[j][i]: where its last row starts.
  const best: number[][] = Array.from({ length: k + 1 }, () => Array<number>(n + 1).fill(Infinity))
  const cut: number[][] = Array.from({ length: k + 1 }, () => Array<number>(n + 1).fill(0))
  best[0]![0] = 0
  for (let j = 1; j <= k; j++) {
    for (let i = 1; i <= n; i++) {
      for (let m = j - 1; m < i; m++) {
        const cost = Math.max(best[j - 1]![m]!, width(m, i))
        if (cost < best[j]![i]!) {
          best[j]![i] = cost
          cut[j]![i] = m
        }
      }
    }
  }
  const rows: TermPill[][] = []
  let end = n
  for (let j = k; j >= 1; j--) {
    const start = cut[j]![end]!
    rows.unshift(pills.slice(start, end))
    end = start
  }
  return rows.filter(row => row.length > 0)
}

/**
 * The band's rows: its three fixed lines (limits, context, cost · tokens, speed, tools, churn ·
 * the session) while each fits `columns`; else the same pills balanced over three rows; else,
 * on a terminal too narrow for that, as many full rows as it takes.
 */
function layoutRows(pills: TermPill[], columns: number, isPowerline: boolean): TermPill[][] {
  const room = Math.max(20, columns - 1)
  const fits = (rows: TermPill[][]) => rows.every(row => rowCells(row, isPowerline) <= room)
  const fixed = ([1, 2, 3] as const).map(line => pills.filter(pill => pill.line === line)).filter(row => row.length > 0)
  if (fits(fixed)) return fixed
  const balanced = balance(pills, 3, isPowerline)
  if (fits(balanced)) return balanced
  return packRows(pills, columns, isPowerline)
}

/**
 * Lays the pills, in order, into as few rows as fit `columns`: each row is filled until the next
 * pill would not fit (the closing cap counted), and a pill wider than a whole row stands alone.
 */
function packRows(pills: TermPill[], columns: number, isPowerline: boolean): TermPill[][] {
  const room = Math.max(20, columns - 1)
  const closing = isPowerline ? 1 : 0
  const rows: TermPill[][] = []
  let row: TermPill[] = []
  let used = 0
  for (const pill of pills) {
    const width = pillCells(pill, isPowerline, row.length === 0)
    if (row.length > 0 && used + width + closing > room) {
      rows.push(row)
      row = []
      used = 0
    }
    used += pillCells(pill, isPowerline, row.length === 0)
    row.push(pill)
  }
  if (row.length > 0) rows.push(row)
  return rows
}

// ---------------------------------------------------------------- hooks

export const register: Register = (on, options) => {
  settings = readSettings(options)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-band',
      description: 'Usage band: refresh and summarize · hide/show · settings · on/off <pill> · set <option> <value>',
      argumentHint: '[hide|show|settings|on <pill>|off <pill>|set <option> <value>]',
    })
    $.clock.every(settings.refreshMs, () => {
      void refreshAll($).catch(() => undefined)
    })
    void refreshAll($).catch(() => undefined)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await applyMeasure($, e.rateLimits, e.context, e.cost)
    const now = await $.clock.now()
    await update($, nowAtom, () => now)
    void refreshTokens($)
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    if (e.effort !== undefined) {
      const effort = String(e.effort)
      void update($, effortAtom, () => effort).catch(() => undefined)
    }
    // Output speed: from the first streamed piece to the end of the response.
    let firstAt: number | null = null
    for await (const chunk of next(e)) {
      if (firstAt === null && chunk.kind !== 'engine' && chunk.kind !== 'stop') firstAt = Date.now()
      if (chunk.kind === 'stop' && chunk.usage !== null && firstAt !== null) {
        const ms = Date.now() - firstAt
        const tokens = chunk.usage.output_tokens
        if (ms >= 250 && tokens > 0) void recordSpeed($, tokens, ms).catch(() => undefined)
      }
      yield chunk
    }
  })

  on('tool.call', async ($, e, next) => {
    void countTool($, String(e.tool)).catch(() => undefined)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const usage = e.usage
    if (usage !== undefined) {
      await update($, estimate, prev => ({
        input: prev.input + usage.input_tokens,
        cacheWrite: prev.cacheWrite + usage.cache_creation_input_tokens,
        output: prev.output + usage.output_tokens,
        cacheRead: prev.cacheRead + usage.cache_read_input_tokens,
        requests: prev.requests + 1,
        isEstimate: true,
      }))
    }
    if (e.agentId === undefined) {
      const ms = e.durationMs
      await update($, turnsAtom, prev => ({ ...prev, lastMs: ms, totalMs: prev.totalMs + ms, timed: prev.timed + 1 }))
      const model = usage?.model
      if (model !== undefined && model !== '' && !model.startsWith('<')) await update($, modelAtom, () => model)
    }
    const done = await next(e)
    void refreshAll($).catch(() => undefined)
    return done
  })

  on('command.run', { command: 'usage-band' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (verb === 'hide') {
      await update($, isHidden, () => true)
      return { text: 'Usage band hidden. Bring it back with /usage-band show' }
    }
    if (verb === 'show') {
      await update($, isHidden, () => false)
      return { text: 'Usage band shown.' }
    }
    if (verb === 'settings' || verb === 'config' || verb === 'help') return { text: describeSettings() }
    if (verb === 'on' || verb === 'off' || verb === 'set') return { text: await runSettingsCommand($, verb, rest) }
    counted = null
    isScriptBroken = false
    await refreshAll($)
    return { text: await summary($) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)
    if (e.surface === 'terminal' && !settings.on.showInTerminal) return next(e)

    const band = await readBand($)

    if (e.surface === 'terminal') {
      const groups = termGroups(band)
      if (groups.length === 0) return next(e)
      const { Box, Text } = $.ui.resolve(e)
      const isPowerline = settings.terminalStyle === 'powerline'
      const rows = layoutRows(groups.flat(), e.props.bodyColumns, isPowerline)

      if (!isPowerline) {
        return (
          <Box flexDirection="column">
            {rows.map(row => (
              <Text wrap="truncate-end">
                {row.map((pill, i) => (
                  <Text>
                    {i === 0 ? '' : PLAIN_GAP}
                    <Text color={TERMINAL_TONES[pill.tone]}>{head(pill)}</Text>
                    {pill.runs.map(run => (
                      <Text color={run.color} bold={run.bold} dimColor={run.dim}>
                        {run.text}
                      </Text>
                    ))}
                  </Text>
                ))}
              </Text>
            ))}
          </Box>
        )
      }

      // Powerline: each row is one chain of colored segments, rounded at both ends. Two segments of
      // one color meet at a thin arrow, two colors at a solid one drawn in the left segment's color.
      return (
        <Box flexDirection="column">
          {rows.map(row => (
            <Text wrap="truncate-end">
              {row.map((pill, i) => {
                const bg = POWERLINE_BG[pill.tone]
                const prev = i === 0 ? undefined : row[i - 1]
                const prevBg = prev === undefined ? undefined : POWERLINE_BG[prev.tone]
                const joint =
                  prevBg === undefined ? (
                    <Text color={bg}>{settings.nerd ? PL.open : ' '}</Text>
                  ) : prevBg === bg ? (
                    <Text color={POWERLINE_FG} backgroundColor={bg} dimColor>
                      {settings.nerd ? PL.thin : '│'}
                    </Text>
                  ) : (
                    <Text color={prevBg} backgroundColor={bg}>
                      {settings.nerd ? PL.arrow : ' '}
                    </Text>
                  )
                return (
                  <Text>
                    {joint}
                    <Text color={POWERLINE_FG} backgroundColor={bg}>
                      {` ${head(pill)}`}
                    </Text>
                    {pill.runs.map(run => (
                      <Text color={run.color} backgroundColor={bg} bold={run.bold} dimColor={run.dim}>
                        {run.text}
                      </Text>
                    ))}
                    <Text backgroundColor={bg}> </Text>
                  </Text>
                )
              })}
              <Text color={POWERLINE_BG[row[row.length - 1]?.tone ?? 'slate']}>{settings.nerd ? PL.close : ' '}</Text>
            </Text>
          ))}
        </Box>
      )
    }

    const groups = pillGroups(band)
    if (groups.length === 0) return next(e)
    const { Box, Svg } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" flexWrap="wrap" columnGap={2} rowGap={1}>
        {groups.map(group => (
          <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
            {group.map(p => (
              <Svg source={p.source} alt={p.alt} width={p.width} height={p.height} isInteractive />
            ))}
          </Box>
        ))}
      </Box>
    )
  })
}
