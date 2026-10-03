import type { On, SessionMeasureInput } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'usage-band',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const HOUR = 60 * 60 * 1000

type SvgSeen = { alt: string; source: string; isInteractive: unknown }

/** Every Svg in a drawn tree, in order. */
function svgs(children: unknown[]): SvgSeen[] {
  const found: SvgSeen[] = []
  for (const child of children) {
    if (typeof child !== 'object' || child === null) continue
    const el = child as { type?: string; props?: Record<string, unknown>; children?: unknown[] }
    if (el.type === 'Svg') {
      found.push({ alt: String(el.props?.alt), source: String(el.props?.source), isInteractive: el.props?.isInteractive })
    }
    found.push(...svgs(el.children ?? []))
  }
  return found
}
const START = Date.UTC(2026, 9, 3, 12, 0, 0)
const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

// What the engine would do beneath the plugin: draw an empty band of its own, echo a measure.
function world(on: On) {
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine-band" />
  })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  return mock.clock(on, { now: START })
}

test('band stays empty before the first reading, then shows limits and cost', async ($, on) => {
  world(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ text: /5h/ })).toBeUndefined()
    await ui.unmount()
  }

  const now = START
  await $.session.measure({
    context: { tokens: 45_000, window: 200_000, percent: 23 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 20, resetsAt: new Date(now + 2 * HOUR + 40 * 60_000).toISOString() },
      { kind: 'seven_day', percentUsed: 58, resetsAt: new Date(now + 31 * HOUR).toISOString() },
    ],
    cost: { usd: 4.32 },
    changed: ['context', 'rateLimits', 'cost'],
  })

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await terminal.find({ text: /20%/ })).toBeDefined()
  expect(await terminal.find({ text: /58%/ })).toBeDefined()
  expect(await terminal.find({ text: '$4.32' })).toBeDefined()
  await terminal.unmount()

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const pills = svgs((await desktop.find({ type: 'Box' }))?.children ?? [])
  expect(pills.map(p => p.alt)).toEqual([
    '5h 20% used, resets in 2h 40m',
    '7d 58% used, resets in 1d 7h',
    'Context 23% full',
    'Session cost $4.32',
  ])
  for (const pill of pills) {
    expect(pill.isInteractive).toBe(true)
    expect(pill.source).toContain('prefers-color-scheme: dark')
    expect(pill.source).toContain('<title>')
  }
  await desktop.unmount()
})

test('band yields to a survey', async ($, on) => {
  world(on)
  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 75 }],
    cost: { usd: 1 },
    changed: ['rateLimits', 'cost'],
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, hasSurvey: true } })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})

test('token pills fall back to turn usage with a ~ when the transcript cannot be read', async ($, on) => {
  world(on)
  on('turn.complete', () => ({ text: '' }))
  await $.turn.complete({
    answer: 'ok',
    durationMs: 1000,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    usage: {
      model: 'claude-opus-5-5',
      input_tokens: 12_600,
      cache_creation_input_tokens: 3_000,
      output_tokens: 3_000,
      cache_read_input_tokens: 954_200,
    },
  })
  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await terminal.find({ text: /~15\.6k/ })).toBeDefined()
  expect(await terminal.find({ text: /~3\.0k/ })).toBeDefined()
  expect(await terminal.find({ text: /~954\.2k/ })).toBeDefined()
  await terminal.unmount()

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(svgs((await desktop.find({ type: 'Box' }))?.children ?? []).map(p => p.alt)).toEqual([
    'Input ~15.6k tokens',
    'Output ~3.0k tokens',
    'Cache read ~954.2k tokens',
    'Model Opus 5.5',
  ])
  await desktop.unmount()
})

test('/usage-band hide and show toggle the band', async ($, on) => {
  world(on)
  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [],
    cost: { usd: 4.32 },
    changed: ['cost'],
  })
  const hidden = await $.command.run({ ...RUN, command: 'usage-band', args: 'hide' })
  expect(hidden.text).toContain('hidden')
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ text: '$4.32' })).toBeUndefined()
  await ui.unmount()

  await $.command.run({ ...RUN, command: 'usage-band', args: 'show' })
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ text: '$4.32' })).toBeDefined()
  await ui.unmount()
})

test('settings turn pills off and compact drops bars', { options: { showContext: false, layout: 'compact' } }, async ($, on) => {
  world(on)
  await $.session.measure({
    context: { tokens: 45_000, window: 200_000, percent: 23 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 20, resetsAt: new Date(START + 2 * HOUR).toISOString() }],
    cost: { usd: 4.32 },
    changed: ['context', 'rateLimits', 'cost'],
  })
  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const pills = svgs((await desktop.find({ type: 'Box' }))?.children ?? [])
  expect(pills.map(p => p.alt)).toEqual(['5h 20% used, resets in 2h 0m', 'Session cost $4.32'])
  // compact: no bar track, no icons
  expect(pills[0]?.source).not.toContain('class="track"')
  expect(pills[0]?.source).not.toContain('class="ic"')
  await desktop.unmount()

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await terminal.find({ text: /█|░/ })).toBeUndefined()
  expect(await terminal.find({ text: /ctx/ })).toBeUndefined()
  await terminal.unmount()
})

test('/usage-band settings lists every toggle', async ($, on) => {
  world(on)
  const out = await $.command.run({ ...RUN, command: 'usage-band', args: 'settings' })
  for (const name of ['5h', '7d', 'context', 'speed', 'effort', 'folder', 'git', 'memory', 'turns']) {
    expect(out.text).toContain(name)
  }
  const bad = await $.command.run({ ...RUN, command: 'usage-band', args: 'off nonsense' })
  expect(bad.text).toContain('Unknown: nonsense')
})

test('turns pill shows the main-loop turn length', async ($, on) => {
  world(on)
  on('turn.complete', () => ({ text: '' }))
  await $.turn.complete({ answer: 'ok', durationMs: 34_000, isAborted: false, turnId: 't1', reason: 'answer' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  // the prompt count comes from $.session.turns(), unanswered in a test: no turns pill yet
  expect(await ui.find({ text: /turns/ })).toBeUndefined()
  await ui.unmount()
})

const MEASURE: SessionMeasureInput = {
  context: { tokens: 45_000, window: 200_000, percent: 23 },
  rateLimits: [{ kind: 'five_hour', percentUsed: 20, resetsAt: new Date(START + 2 * HOUR).toISOString() }],
  cost: { usd: 4.32 },
  changed: ['context', 'rateLimits', 'cost'],
}

test('terminal draws powerline segments with Nerd Font glyphs by default', async ($, on) => {
  world(on)
  await $.session.measure(MEASURE)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ text: /\ue0b6/ })).toBeDefined()
  expect(await ui.find({ text: /\ue0b4/ })).toBeDefined()
  expect(await ui.find({ text: /\uf0e4/ })).toBeDefined()
  await ui.unmount()
})

test('plain style without Nerd Font uses text labels only', { options: { terminalStyle: 'plain', nerdFont: false } }, async ($, on) => {
  world(on)
  await $.session.measure(MEASURE)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ text: /[\ue000-\uf8ff]/ })).toBeUndefined()
  expect(await ui.find({ text: /5h/ })).toBeDefined()
  expect(await ui.find({ text: '$4.32' })).toBeDefined()
  await ui.unmount()
})

test('terminal draws three lines: limits, context, cost · tokens · session', async ($, on) => {
  world(on)
  on('turn.complete', () => ({ text: '' }))
  await $.session.measure({
    ...MEASURE,
    rateLimits: [
      { kind: 'five_hour', percentUsed: 20, resetsAt: new Date(START + 2 * HOUR).toISOString() },
      { kind: 'seven_day', percentUsed: 58, resetsAt: new Date(START + 31 * HOUR).toISOString() },
    ],
  })
  await $.turn.complete({
    answer: 'ok',
    durationMs: 1000,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    usage: { model: 'claude-opus-5-5', input_tokens: 300, cache_creation_input_tokens: 15_000, output_tokens: 160_000, cache_read_input_tokens: 34_000_000 },
  })
  const rowsAt = async (bodyColumns: number) => {
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns } })
    const root = await ui.find({ type: 'Box' })
    const rows = (root?.children ?? []).map(row => JSON.stringify(row))
    await ui.unmount()
    return rows
  }
  const wide = await rowsAt(200)
  expect(wide.length).toBe(3)
  expect(wide[0]).toContain('20%')
  expect(wide[0]).toContain('$4.32')
  expect(wide[1]).toContain('160.0k')
  expect(wide[2]).toContain('Opus 5.5')
  // narrower than the first line: the same pills are balanced over three lines
  expect((await rowsAt(70)).length).toBe(3)
})
