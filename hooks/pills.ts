// Pure helpers: number/time formatting and the SVG markup of each pill.
// No `$` here, so the preview script can import this file with plain Node.
import type {
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

export const FIVE_HOURS_MS = 5 * 60 * 60 * 1000
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/** How the pills are drawn: the bar thresholds and whether icons and bars are left out. */
export type Look = { warnAt: number; hotAt: number; isCompact: boolean }

export const DEFAULT_LOOK: Look = { warnAt: 70, hotAt: 90, isCompact: false }

export type Tone =
  | 'teal'
  | 'purple'
  | 'rose'
  | 'indigo'
  | 'red'
  | 'green'
  | 'blue'
  | 'lime'
  | 'gold'
  | 'orange'
  | 'pink'
  | 'cyan'
  | 'slate'

/** Light background, light text, dark background, dark text. */
const TONES: Record<Tone, [string, string, string, string]> = {
  teal: ['#d3f4ee', '#0d4b42', '#10332e', '#a4ebdf'],
  purple: ['#ebe2fb', '#3d2869', '#2a2042', '#d5c4fa'],
  rose: ['#fbe0ec', '#7a1f48', '#3a1a28', '#f6b6d2'],
  indigo: ['#e0e4fb', '#28327a', '#1d2142', '#c0c8f7'],
  red: ['#fbe0dd', '#7a241e', '#3b1c1a', '#f5b8b1'],
  green: ['#dbf2da', '#1d5a22', '#19331d', '#b2e6b6'],
  blue: ['#dce8fb', '#1b437e', '#18283f', '#b4cef5'],
  lime: ['#ecf6cf', '#435a0b', '#2a3214', '#d4ec9a'],
  gold: ['#faefc9', '#694e06', '#372d0f', '#f1d98b'],
  orange: ['#fde6d2', '#7a3a0c', '#3a2414', '#f7c39a'],
  pink: ['#f9e0f7', '#6e1f68', '#361b34', '#f0b9eb'],
  cyan: ['#d6f1fa', '#0f4a5e', '#13303a', '#a6dff0'],
  slate: ['#e6e9ee', '#2f3a48', '#252a31', '#ccd4de'],
}

/** The same hues for the terminal's Text colors. */
export const TERMINAL_TONES: Record<Tone, string> = {
  teal: '#2fb8a5',
  purple: '#a580ea',
  rose: '#e2689f',
  indigo: '#7d8cf0',
  red: '#e2766e',
  green: '#62bd62',
  blue: '#5f9eec',
  lime: '#a3c94a',
  gold: '#d6a92e',
  orange: '#e8904a',
  pink: '#d77bd0',
  cyan: '#4cbfe0',
  slate: '#8e9aab',
}

/** Segment backgrounds for the terminal's powerline band: mid tones that light text reads on. */
export const POWERLINE_BG: Record<Tone, string> = {
  teal: '#1d6b60',
  purple: '#5a3f96',
  rose: '#8a2d5a',
  indigo: '#3a4899',
  red: '#8c3a33',
  green: '#2e6a33',
  blue: '#2a5590',
  lime: '#55702a',
  gold: '#7c6213',
  orange: '#8a4a1c',
  pink: '#7c3376',
  cyan: '#1c6580',
  slate: '#465060',
}

/** Text on a powerline segment. */
export const POWERLINE_FG = '#f1f3f5'

export const BAR_COLORS = { ok: '#22a55a', warn: '#e0a400', hot: '#e5484d' }

export function level(percent: number, look: Look): 0 | 1 | 2 {
  return percent >= look.hotAt ? 2 : percent >= look.warnAt ? 1 : 0
}

export function barColor(percent: number, look: Look = DEFAULT_LOOK): string {
  return [BAR_COLORS.ok, BAR_COLORS.warn, BAR_COLORS.hot][level(percent, look)] ?? BAR_COLORS.ok
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(Math.round(n))
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

export function formatPercent(p: number): string {
  return `${Math.round(p)}%`
}

export function formatGiB(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)}G`
}

/** A span of time: "1d 7h", "2h 40m", "12m". */
export function formatLeft(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

/** A short span, seconds under a minute: "34s", "2h 40m". */
export function formatShort(ms: number): string {
  return ms < 60_000 ? `${Math.max(0, Math.round(ms / 1000))}s` : formatLeft(ms)
}

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`
}

/** "claude-opus-5-5" → "Opus 5.5"; "claude-haiku-4-5-20251001" → "Haiku 4.5"; anything else as given. */
export function prettyModel(model: string): string {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(\[[^\]]*\])?$/.exec(model)
  if (m === null) return model.replace(/^claude-/, '')
  const name = (m[1] ?? '').charAt(0).toUpperCase() + (m[1] ?? '').slice(1)
  return `${name} ${m[2]}${m[3] === undefined ? '' : `.${m[3]}`}${m[4] ?? ''}`
}

/** The last part of a path, either separator. */
export function baseName(path: string): string {
  const parts = path.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || path
}

/** How much of the window has passed, 0..1: 1 − time left / window length. */
export function elapsedFraction(limit: UsageBandLimit, windowMs: number, now: number): number | null {
  if (limit.resetsAtMs === null) return null
  const left = Math.min(windowMs, Math.max(0, limit.resetsAtMs - now))
  return 1 - left / windowMs
}

/** Where usage lands at reset if the pace so far holds; null too early in the window to say. */
export function projectedPercent(percentUsed: number, elapsed: number | null): number | null {
  if (elapsed === null || elapsed < 0.05) return null
  return percentUsed / elapsed
}

/** Share of input served from the cache, 0..100. */
export function cacheHitPercent(tokens: UsageBandTokens): number | null {
  const all = tokens.input + tokens.cacheWrite + tokens.cacheRead
  return all === 0 ? null : (tokens.cacheRead / all) * 100
}

export type LimitKind = '5h' | '7d' | 'spend'

export function windowOf(kind: LimitKind): number | null {
  return kind === '5h' ? FIVE_HOURS_MS : kind === '7d' ? SEVEN_DAYS_MS : null
}

// ---------------------------------------------------------------- SVG

const FONT_SIZE = 12
const CHAR_W = 7.2
const HEIGHT = 22
const PAD_X = 8
const ICON = 12
const BAR_W = 38
const BAR_H = 5

const ICONS = {
  gauge:
    '<path d="M1 9.5a5 5 0 0 1 10 0"/><path d="M6 9.5 8.6 5.6"/><circle cx="6" cy="9.5" r="0.9" class="dot"/>',
  calendar:
    '<rect x="1.3" y="2.3" width="9.4" height="8.6" rx="1.6"/><path d="M1.3 5.2h9.4M3.9 1v2.4M8.1 1v2.4"/>',
  wallet: '<rect x="1" y="2.6" width="10" height="7.8" rx="1.6"/><path d="M1 5h10M7.6 7.6h1.4"/>',
  hourglass:
    '<path d="M3 1.2h6M3 10.8h6M3.6 1.2c0 2.8 4.8 2.7 4.8 4.8S3.6 8.4 3.6 10.8M8.4 1.2c0 2.8-4.8 2.7-4.8 4.8s4.8 2.4 4.8 4.8"/>',
  window: '<rect x="1" y="1.5" width="10" height="9" rx="1.6"/><path d="M1 7.2h10"/><path d="M2.6 9h6.8" class="fat"/>',
  up: '<path d="M6 10.6V1.6M2.6 5 6 1.6 9.4 5"/>',
  down: '<path d="M6 1.4v9M2.6 7 6 10.4 9.4 7"/>',
  layers:
    '<path d="M6 1.2 11 3.8 6 6.4 1 3.8Z"/><path d="M1 6.4 6 9 11 6.4"/><path d="M1 8.8l5 2.6 5-2.6"/>',
  bolt: '<path d="M6.8 1 2.4 6.8h3.4L5.2 11l4.4-5.8H6.2Z"/>',
  dollar:
    '<circle cx="6" cy="6" r="5.3"/><path d="M7.9 4.1c-.4-.6-1.1-.9-1.9-.9-1 0-1.8.6-1.8 1.4 0 1.9 3.7.9 3.7 2.8 0 .8-.8 1.4-1.9 1.4-.8 0-1.6-.3-2-.9M6 2.2v1M6 8.8v1"/>',
  wrench: '<path d="M7.6 1.3a3 3 0 0 0-2.9 3.9L1.4 8.5a1.2 1.2 0 0 0 1.7 1.7l3.3-3.3a3 3 0 0 0 3.9-2.9L8.6 5.2 7 3.6Z"/>',
  diff: '<path d="M3.5 1.5v5M1 4h5M6.5 9.5h4.5"/><path d="M8.5 1.5 3.5 10.5"/>',
  chip:
    '<rect x="2.5" y="2.5" width="7" height="7" rx="1.2"/><path d="M4.5 1v1.5M7.5 1v1.5M4.5 9.5V11M7.5 9.5V11M1 4.5h1.5M1 7.5h1.5M9.5 4.5H11M9.5 7.5H11"/>',
  bulb: '<path d="M4 8.2C2.9 7.4 2.2 6.3 2.2 5a3.8 3.8 0 0 1 7.6 0c0 1.3-.7 2.4-1.8 3.2V9.4H4Z"/><path d="M4.4 11h3.2"/>',
  folder: '<path d="M1 3a1 1 0 0 1 1-1h2.6l1.2 1.4H10a1 1 0 0 1 1 1V9.6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1Z"/>',
  branch:
    '<circle cx="3.2" cy="2.4" r="1.3"/><circle cx="3.2" cy="9.6" r="1.3"/><circle cx="8.8" cy="3.6" r="1.3"/><path d="M3.2 3.7v4.6M8.8 4.9c0 2.4-5.6 1.6-5.6 3.4"/>',
  memory:
    '<rect x="1" y="3" width="10" height="5.6" rx="1"/><path d="M3.4 5h1M5.5 5h1M7.6 5h1M2.5 8.6V10M4.5 8.6V10M6.5 8.6V10M8.5 8.6V10"/>',
  stopwatch: '<circle cx="6" cy="6.8" r="4.4"/><path d="M6 6.8V4.4M4.6 1h2.8M9.4 3.4l.9-.9"/>',
  bubble:
    '<path d="M1.2 2.6c0-.8.6-1.4 1.4-1.4h6.8c.8 0 1.4.6 1.4 1.4v4.6c0 .8-.6 1.4-1.4 1.4H5L2.6 10.6V8.6c-.8 0-1.4-.6-1.4-1.4Z"/>',
} as const

export type IconName = keyof typeof ICONS

/** Text accents with fixed hues: added, deleted, warning. */
type Accent = 'add' | 'del' | 'warn'

const ACCENTS: Record<Accent, [string, string]> = {
  add: ['#1f7a35', '#7ee08f'],
  del: ['#b3261e', '#f59a93'],
  warn: ['#8a5a00', '#f3c969'],
}

type Segment =
  | { kind: 'icon'; name: IconName }
  | { kind: 'text'; text: string; isBold?: boolean; isDim?: boolean; accent?: Accent }
  | { kind: 'bar'; percent: number; elapsed: number | null }
  | { kind: 'sep' }
  | { kind: 'gap'; w: number }

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function segmentWidth(seg: Segment): number {
  switch (seg.kind) {
    case 'icon':
      return ICON
    case 'text':
      return seg.text.length * CHAR_W
    case 'bar':
      return BAR_W
    case 'sep':
      return 1
    case 'gap':
      return seg.w
  }
}

/** Compact drops icons, bars and separators, keeping one gap between what is left. */
function compact(segments: Segment[]): Segment[] {
  const kept: Segment[] = []
  for (const seg of segments) {
    if (seg.kind === 'icon' || seg.kind === 'bar' || seg.kind === 'sep') continue
    const last = kept[kept.length - 1]
    if (seg.kind === 'gap') {
      if (last === undefined) continue
      if (last.kind === 'gap') last.w = Math.max(last.w, seg.w)
      else kept.push({ ...seg })
      continue
    }
    kept.push(seg)
  }
  while (kept[kept.length - 1]?.kind === 'gap') kept.pop()
  return kept
}

export type Pill = { source: string; width: number; height: number; alt: string }

const GAP_S = { kind: 'gap', w: 5 } as const
const GAP_M = { kind: 'gap', w: 7 } as const

/**
 * One pill's SVG. `label` stands in for the icon in the compact layout, where a bare number
 * would not say what it counts.
 */
function pill(tone: Tone, raw: Segment[], title: string, alt: string, look: Look, label?: string): Pill {
  const segments = look.isCompact
    ? [...(label === undefined ? [] : [{ kind: 'text', text: label, isDim: true } as Segment, GAP_S]), ...compact(raw)]
    : raw
  const [lightBg, lightFg, darkBg, darkFg] = TONES[tone]
  const width = Math.ceil(PAD_X * 2 + segments.reduce((sum, seg) => sum + segmentWidth(seg), 0))
  const mid = HEIGHT / 2
  let x = PAD_X
  const body: string[] = []
  for (const seg of segments) {
    const w = segmentWidth(seg)
    switch (seg.kind) {
      case 'icon':
        body.push(`<g class="ic" transform="translate(${x} ${mid - ICON / 2})">${ICONS[seg.name]}</g>`)
        break
      case 'text': {
        const cls = ['t', seg.isBold ? 'b' : '', seg.isDim ? 'd' : '', seg.accent ?? ''].filter(Boolean).join(' ')
        body.push(
          `<text x="${x}" y="${mid + 4.2}" class="${cls}" textLength="${w.toFixed(1)}" lengthAdjust="spacingAndGlyphs">${escapeXml(seg.text)}</text>`,
        )
        break
      }
      case 'bar': {
        const y = mid - BAR_H / 2
        const fill = (Math.min(100, Math.max(0, seg.percent)) / 100) * BAR_W
        body.push(`<rect x="${x}" y="${y}" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}" class="track"/>`)
        if (fill > 0) {
          body.push(
            `<rect x="${x}" y="${y}" width="${Math.max(fill, BAR_H).toFixed(1)}" height="${BAR_H}" rx="${BAR_H / 2}" fill="${barColor(seg.percent, look)}"/>`,
          )
        }
        if (seg.elapsed !== null) {
          const tx = (x + seg.elapsed * BAR_W).toFixed(1)
          body.push(`<line x1="${tx}" x2="${tx}" y1="${y - 3}" y2="${y + BAR_H + 3}" class="tick"/>`)
        }
        break
      }
      case 'sep':
        body.push(`<line x1="${x + 0.5}" x2="${x + 0.5}" y1="${mid - 6}" y2="${mid + 6}" class="sep"/>`)
        break
      case 'gap':
        break
    }
    x += w
  }

  // Rules are scoped to the pill's tone so several pills inlined in one page keep their own colors.
  const k = `.ub-${tone}`
  const accentRules = (i: 0 | 1) =>
    (Object.keys(ACCENTS) as Accent[]).map(a => `${k} .t.${a}{fill:${ACCENTS[a][i]}}`).join('')
  const style = [
    `${k} .bg{fill:${lightBg}}`,
    `${k} .t{fill:${lightFg};font:${FONT_SIZE}px ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace}`,
    `${k} .b{font-weight:700}`,
    `${k} .d{opacity:.78}`,
    accentRules(0),
    `${k} .ic{fill:none;stroke:${lightFg};stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round}`,
    `${k} .ic .dot{fill:${lightFg};stroke:none}`,
    `${k} .ic .fat{stroke-width:2}`,
    `${k} .track{fill:${lightFg};fill-opacity:.16}`,
    `${k} .tick{stroke:${lightFg};stroke-width:1.6;stroke-linecap:round}`,
    `${k} .sep{stroke:${lightFg};stroke-opacity:.35}`,
    `@media (prefers-color-scheme: dark){`,
    `${k} .bg{fill:${darkBg}}${k} .t{fill:${darkFg}}${k} .ic{stroke:${darkFg}}${k} .ic .dot{fill:${darkFg}}`,
    accentRules(1),
    `${k} .track{fill:${darkFg};fill-opacity:.2}${k} .tick{stroke:${darkFg}}${k} .sep{stroke:${darkFg}}`,
    `}`,
  ].join('')

  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" class="ub-${tone}" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}">` +
    `<title>${escapeXml(title)}</title>` +
    `<style>${style}</style>` +
    `<rect class="bg" x="0" y="0" width="${width}" height="${HEIGHT}" rx="7"/>` +
    body.join('') +
    `</svg>`

  return { source, width, height: HEIGHT, alt }
}

function lines(...parts: string[]): string {
  return parts.filter(Boolean).join('\n')
}

// ---------------------------------------------------------------- limits and context

const LIMIT_STYLE: Record<LimitKind, { tone: Tone; icon: IconName; name: string }> = {
  '5h': { tone: 'teal', icon: 'gauge', name: '5-hour window' },
  '7d': { tone: 'purple', icon: 'calendar', name: '7-day window' },
  spend: { tone: 'rose', icon: 'wallet', name: 'Spend limit' },
}

export function limitPill(
  kind: LimitKind,
  limit: UsageBandLimit,
  now: number,
  look: Look = DEFAULT_LOOK,
  showPace = false,
): Pill {
  const { tone, icon, name } = LIMIT_STYLE[kind]
  const windowMs = windowOf(kind)
  const elapsed = windowMs === null ? null : elapsedFraction(limit, windowMs, now)
  const leftMs = limit.resetsAtMs === null ? null : Math.max(0, limit.resetsAtMs - now)
  const left = leftMs === null ? null : formatLeft(leftMs)
  const pct = formatPercent(limit.percentUsed)
  const projected = showPace ? projectedPercent(limit.percentUsed, elapsed) : null
  const paceLevel = projected === null ? 0 : level(projected, look)

  const segments: Segment[] = [
    { kind: 'icon', name: icon },
    GAP_S,
    { kind: 'text', text: kind },
    GAP_M,
    { kind: 'bar', percent: limit.percentUsed, elapsed },
    GAP_M,
    { kind: 'text', text: pct, isBold: true },
  ]
  if (projected !== null) {
    segments.push(
      { kind: 'gap', w: 4 },
      {
        kind: 'text',
        text: `→${formatPercent(projected)}`,
        isDim: paceLevel === 0,
        ...(paceLevel === 2 ? { accent: 'del' as const } : paceLevel === 1 ? { accent: 'warn' as const } : {}),
      },
    )
  }
  if (left !== null) {
    segments.push(GAP_M, { kind: 'sep' }, GAP_M, { kind: 'icon', name: 'hourglass' }, { kind: 'gap', w: 4 }, {
      kind: 'text',
      text: left,
      isDim: true,
    })
  }

  const title = lines(
    `${name}: ${limit.percentUsed}% used`,
    left === null ? (windowMs === null ? '' : 'Reset time unknown') : `Resets in ${left}`,
    elapsed === null ? '' : `${Math.round(elapsed * 100)}% of the window has passed (marker)`,
    projected === null ? '' : `At this pace: ~${formatPercent(projected)} by reset`,
  )
  return pill(tone, segments, title, `${kind} ${pct} used${left === null ? '' : `, resets in ${left}`}`, look)
}

export function contextPill(context: UsageBandContext, look: Look = DEFAULT_LOOK): Pill | null {
  if (context.tokens === null) return null
  const percent = context.percent ?? (context.tokens / context.window) * 100
  const pct = formatPercent(percent)
  return pill(
    'indigo',
    [
      { kind: 'icon', name: 'window' },
      GAP_S,
      { kind: 'text', text: 'ctx' },
      GAP_M,
      { kind: 'bar', percent, elapsed: null },
      GAP_M,
      { kind: 'text', text: pct, isBold: true },
      GAP_M,
      { kind: 'sep' },
      GAP_M,
      { kind: 'text', text: `${formatTokens(context.tokens)}/${formatTokens(context.window)}`, isDim: true },
    ],
    `Context window: ${formatTokens(context.tokens)} of ${formatTokens(context.window)} tokens (${pct})`,
    `Context ${pct} full`,
    look,
  )
}

function contextLine(context: UsageBandContext | null): string {
  if (context === null || context.tokens === null) return ''
  const pct = context.percent === null ? '' : ` (${context.percent}%)`
  return `Context: ${formatTokens(context.tokens)} / ${formatTokens(context.window)}${pct}`
}

// ---------------------------------------------------------------- tokens, speed and cost

export type TokenPillSet = { input: boolean; output: boolean; cacheRead: boolean; cacheHit: boolean }

export function tokenPills(
  tokens: UsageBandTokens,
  context: UsageBandContext | null,
  look: Look = DEFAULT_LOOK,
  show: TokenPillSet = { input: true, output: true, cacheRead: true, cacheHit: false },
): Pill[] {
  const mark = tokens.isEstimate ? '~' : ''
  const input = tokens.input + tokens.cacheWrite
  const source = tokens.isEstimate
    ? 'Source: per-turn usage (transcript unreadable, approximate)'
    : 'Source: session transcript + subagents'
  const requests = tokens.isEstimate ? `Turns: ${tokens.requests}` : `Requests: ${tokens.requests}`
  const hit = cacheHitPercent(tokens)
  const tail = [contextLine(context), requests, source]
  const pills: Pill[] = []
  if (show.input) {
    pills.push(
      pill(
        'red',
        [{ kind: 'icon', name: 'up' }, GAP_S, { kind: 'text', text: mark + formatTokens(input) }],
        lines(
          `Input: ${mark}${formatTokens(input)} tokens`,
          `  uncached input: ${formatTokens(tokens.input)}`,
          `  cache write: ${formatTokens(tokens.cacheWrite)}`,
          ...tail,
        ),
        `Input ${mark}${formatTokens(input)} tokens`,
        look,
        'in',
      ),
    )
  }
  if (show.output) {
    pills.push(
      pill(
        'green',
        [{ kind: 'icon', name: 'down' }, GAP_S, { kind: 'text', text: mark + formatTokens(tokens.output) }],
        lines(`Output: ${mark}${formatTokens(tokens.output)} tokens`, ...tail),
        `Output ${mark}${formatTokens(tokens.output)} tokens`,
        look,
        'out',
      ),
    )
  }
  if (show.cacheRead) {
    const segments: Segment[] = [
      { kind: 'icon', name: 'layers' },
      GAP_S,
      { kind: 'text', text: mark + formatTokens(tokens.cacheRead) },
    ]
    if (show.cacheHit && hit !== null) {
      segments.push(GAP_M, { kind: 'sep' }, GAP_M, { kind: 'text', text: formatPercent(hit), isDim: true })
    }
    pills.push(
      pill(
        'blue',
        segments,
        lines(
          `Cache read: ${mark}${formatTokens(tokens.cacheRead)} tokens`,
          hit === null ? '' : `Cache hit rate: ${formatPercent(hit)} of input`,
          ...tail,
        ),
        `Cache read ${mark}${formatTokens(tokens.cacheRead)} tokens`,
        look,
        'cache',
      ),
    )
  }
  return pills
}

export function speedPill(speed: UsageBandSpeed, look: Look = DEFAULT_LOOK): Pill {
  const last = `${speed.lastTps.toFixed(1)} t/s`
  const avg = speed.ms === 0 ? 0 : (speed.tokens / speed.ms) * 1000
  return pill(
    'lime',
    [{ kind: 'icon', name: 'bolt' }, GAP_S, { kind: 'text', text: last }],
    lines(
      `Output speed, last request: ${last}`,
      `Average this session: ${avg.toFixed(1)} t/s over ${speed.requests} requests`,
      'Measured from the first streamed token to the end of each response.',
    ),
    `Output ${last}`,
    look,
    'speed',
  )
}

export function costPill(
  usd: number,
  context: UsageBandContext | null,
  look: Look = DEFAULT_LOOK,
  perHour: number | null = null,
): Pill {
  const segments: Segment[] = [{ kind: 'icon', name: 'dollar' }, { kind: 'gap', w: 4 }, { kind: 'text', text: formatUsd(usd) }]
  if (perHour !== null) {
    segments.push(GAP_M, { kind: 'sep' }, GAP_M, { kind: 'text', text: `${formatUsd(perHour)}/h`, isDim: true })
  }
  return pill(
    'gold',
    segments,
    lines(
      `Session cost: ${formatUsd(usd)}`,
      'At API list prices (not what a subscription actually pays).',
      perHour === null ? '' : `Rate so far: ${formatUsd(perHour)} per hour`,
      contextLine(context),
    ),
    `Session cost ${formatUsd(usd)}`,
    look,
  )
}

// ---------------------------------------------------------------- work

export function toolsPill(tools: UsageBandTools, look: Look = DEFAULT_LOOK): Pill {
  const mark = tools.isEstimate ? '~' : ''
  const top = Object.entries(tools.byTool)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, n]) => `  ${name.replace(/^mcp__/, '')}: ${n}`)
  return pill(
    'orange',
    [{ kind: 'icon', name: 'wrench' }, GAP_S, { kind: 'text', text: `${mark}${tools.total}` }],
    lines(
      `Tool calls: ${mark}${tools.total}`,
      ...top,
      tools.isEstimate ? 'Counted since the band loaded (transcript unreadable)' : 'Source: session transcript + subagents',
    ),
    `${mark}${tools.total} tool calls`,
    look,
    'tools',
  )
}

export function churnPill(churn: UsageBandChurn, look: Look = DEFAULT_LOOK): Pill {
  return pill(
    'orange',
    [
      { kind: 'icon', name: 'diff' },
      GAP_S,
      { kind: 'text', text: `+${churn.added}`, accent: 'add' },
      { kind: 'gap', w: 6 },
      { kind: 'text', text: `−${churn.removed}`, accent: 'del' },
    ],
    lines(
      `Lines changed: +${churn.added} −${churn.removed}`,
      `Files touched: ${churn.files}`,
      'Edit, MultiEdit and Write calls that succeeded; a Write counts every line it wrote.',
    ),
    `${churn.added} lines added, ${churn.removed} removed`,
    look,
    'lines',
  )
}

// ---------------------------------------------------------------- session

export function modelPill(model: string, look: Look = DEFAULT_LOOK): Pill {
  const name = prettyModel(model)
  return pill('slate', [{ kind: 'icon', name: 'chip' }, GAP_S, { kind: 'text', text: name }], `Model: ${model}`, `Model ${name}`, look)
}

export function effortPill(effort: string, look: Look = DEFAULT_LOOK): Pill {
  return pill(
    'pink',
    [{ kind: 'icon', name: 'bulb' }, GAP_S, { kind: 'text', text: effort }],
    `Thinking effort of the last request: ${effort}`,
    `Thinking ${effort}`,
    look,
    'think',
  )
}

export function folderPill(cwd: string, look: Look = DEFAULT_LOOK): Pill {
  const name = baseName(cwd)
  return pill('slate', [{ kind: 'icon', name: 'folder' }, GAP_S, { kind: 'text', text: name }], `Working directory:\n${cwd}`, `Folder ${name}`, look)
}

export function gitPill(git: UsageBandGit, look: Look = DEFAULT_LOOK): Pill {
  if (!git.isRepo) {
    return pill('slate', [{ kind: 'icon', name: 'branch' }, GAP_S, { kind: 'text', text: 'no git', isDim: true }], 'Not a git repository', 'No git', look)
  }
  const branch = git.branch ?? 'detached'
  const segments: Segment[] = [{ kind: 'icon', name: 'branch' }, GAP_S, { kind: 'text', text: branch }]
  if (git.dirty > 0) segments.push({ kind: 'gap', w: 6 }, { kind: 'text', text: `±${git.dirty}`, accent: 'warn' })
  return pill(
    'slate',
    segments,
    lines(`Git branch: ${branch}`, git.dirty > 0 ? `${git.dirty} changed or untracked files` : 'Working tree clean'),
    `Branch ${branch}`,
    look,
    'git',
  )
}

export function durationPill(ms: number, look: Look = DEFAULT_LOOK): Pill {
  const text = formatLeft(ms)
  return pill('slate', [{ kind: 'icon', name: 'stopwatch' }, GAP_S, { kind: 'text', text }], `Session running for ${text}`, `Session ${text}`, look, 'up')
}

export function turnsPill(turns: UsageBandTurns, look: Look = DEFAULT_LOOK): Pill {
  const segments: Segment[] = [{ kind: 'icon', name: 'bubble' }, GAP_S, { kind: 'text', text: String(turns.count) }]
  if (turns.timed > 0) {
    segments.push(GAP_M, { kind: 'sep' }, GAP_M, { kind: 'text', text: formatShort(turns.lastMs), isDim: true })
  }
  const avg = turns.timed === 0 ? 0 : turns.totalMs / turns.timed
  return pill(
    'slate',
    segments,
    lines(
      `Prompts this session: ${turns.count}`,
      turns.timed === 0 ? '' : `Last turn: ${formatShort(turns.lastMs)}`,
      turns.timed === 0 ? '' : `Average turn: ${formatShort(avg)} (${turns.timed} timed)`,
    ),
    `${turns.count} turns`,
    look,
    'turns',
  )
}

export function memoryPill(memory: UsageBandMemory, look: Look = DEFAULT_LOOK): Pill {
  const used = memory.total - memory.free
  const percent = memory.total === 0 ? 0 : (used / memory.total) * 100
  return pill(
    'cyan',
    [
      { kind: 'icon', name: 'memory' },
      GAP_S,
      { kind: 'text', text: 'mem' },
      GAP_M,
      { kind: 'bar', percent, elapsed: null },
      GAP_M,
      { kind: 'text', text: `${formatGiB(used)}/${formatGiB(memory.total)}`, isDim: true },
    ],
    `Machine memory: ${formatGiB(used)} of ${formatGiB(memory.total)} used (${formatPercent(percent)})`,
    `Memory ${formatPercent(percent)} used`,
    look,
  )
}

// ---------------------------------------------------------------- terminal bar

export type BarRun = { text: string; kind: 'fill' | 'empty' | 'marker' }

/** Ten cells of █ and ░ with │ where the elapsed part of the window ends. */
export function terminalBar(percent: number, elapsed: number | null): BarRun[] {
  const cells = 10
  const filled = Math.round(Math.min(100, Math.max(0, percent)) / 10)
  const marker = elapsed === null ? -1 : Math.min(cells - 1, Math.floor(elapsed * cells))
  const runs: BarRun[] = []
  for (let i = 0; i < cells; i++) {
    const kind: BarRun['kind'] = i === marker ? 'marker' : i < filled ? 'fill' : 'empty'
    const ch = kind === 'marker' ? '│' : kind === 'fill' ? '█' : '░'
    const last = runs[runs.length - 1]
    if (last !== undefined && last.kind === kind && kind !== 'marker') last.text += ch
    else runs.push({ text: ch, kind })
  }
  return runs
}
