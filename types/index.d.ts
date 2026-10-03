/** One rate-limit window as last read: percent used and reset time (ms since epoch). */
export type UsageBandLimit = { percentUsed: number; resetsAtMs: number | null }

/** Token totals of the session (main transcript + subagents). */
export type UsageBandTokens = {
  /** Uncached input tokens. */
  input: number
  /** Tokens written to the prompt cache. */
  cacheWrite: number
  output: number
  cacheRead: number
  /** Unique API requests counted. */
  requests: number
  /** True when counted from turn.complete instead of the transcript (shown with "~"). */
  isEstimate: boolean
}

export type UsageBandContext = { tokens: number | null; window: number; percent: number | null }

/** Tool calls by tool name, and their total. */
export type UsageBandTools = { total: number; byTool: Record<string, number>; isEstimate: boolean }

/** Lines added and removed by Edit, MultiEdit and Write calls that did not fail. */
export type UsageBandChurn = { added: number; removed: number; files: number }

/** Prompts this session ($.session.turns()), and the length of the main-loop turns timed since the band loaded. */
export type UsageBandTurns = { count: number; lastMs: number; totalMs: number; timed: number }

/** The working directory's git state; `isRepo` false outside a repository. */
export type UsageBandGit = { isRepo: boolean; branch: string | null; dirty: number }

/** Output speed: the last main-loop request's tokens per second, and the sums for the average. */
export type UsageBandSpeed = { lastTps: number; tokens: number; ms: number; requests: number }

/** Machine memory in bytes. */
export type UsageBandMemory = { total: number; free: number }

/** The highest alert level already toasted per window: 0 none, 1 warn, 2 hot. */
export type UsageBandAlerted = { fiveHour: number; sevenDay: number; spend: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': {
      fiveHour: UsageBandLimit | null
      sevenDay: UsageBandLimit | null
      spendLimit: UsageBandLimit | null
      context: UsageBandContext | null
      costUsd: number | null
      /** When the session began, ms since epoch ($.session.usage().startedAt). */
      startedAt: number | null
      tokens: UsageBandTokens | null
      /** Fallback totals summed from turn.complete usage. */
      estimate: UsageBandTokens
      /** Tool calls counted from the transcript. */
      tools: UsageBandTools | null
      /** Tool calls counted live by the tool.call hook (fallback). */
      liveTools: UsageBandTools
      churn: UsageBandChurn | null
      turns: UsageBandTurns
      model: string | null
      /** Thinking effort of the last main-loop request. */
      effort: string | null
      cwd: string | null
      git: UsageBandGit | null
      speed: UsageBandSpeed | null
      memory: UsageBandMemory | null
      alerted: UsageBandAlerted
      /** Last refresh time, ms since epoch: what the countdowns count from. */
      now: number
      isHidden: boolean
    }
  }
}
