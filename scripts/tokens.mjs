#!/usr/bin/env node
// Sums the token usage, tool calls and line churn of one Claude Code session from its transcript.
//
//   node tokens.mjs <session-id>
//
// Reads ~/.claude/projects/*/<id>.jsonl and ~/.claude/projects/*/<id>/subagents/*.jsonl and prints
// one JSON line. The same message is written once per content block, so each (message.id, requestId)
// pair is counted once, taking the largest value of every usage field; tool_use blocks count once
// per id. Churn counts Edit, MultiEdit and Write calls whose result was not an error.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const FIELDS = ['input_tokens', 'cache_creation_input_tokens', 'output_tokens', 'cache_read_input_tokens']

function fail(reason) {
  process.stdout.write(JSON.stringify({ ok: false, reason }) + '\n')
  process.exit(0)
}

function lines(text) {
  if (typeof text !== 'string' || text.length === 0) return []
  return text.replace(/\n$/, '').split('\n')
}

/** Lines removed and added between two texts, ignoring their common head and tail. */
function diffCount(before, after) {
  const a = lines(before)
  const b = lines(after)
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++
  return { removed: a.length - head - tail, added: b.length - head - tail }
}

const id = process.argv[2]
if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) fail('bad session id')

const root = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects')

let main = null
let projectDirs = []
try {
  projectDirs = readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory())
} catch {
  fail('no projects folder')
}
for (const dir of projectDirs) {
  const candidate = join(root, dir.name, `${id}.jsonl`)
  try {
    const stat = statSync(candidate)
    if (stat.isFile() && (main === null || stat.mtimeMs > main.mtimeMs)) {
      main = { path: candidate, dir: join(root, dir.name), size: stat.size, mtimeMs: stat.mtimeMs }
    }
  } catch {}
}
if (main === null) fail('transcript not found')

const files = [main.path]
try {
  const subDir = join(main.dir, id, 'subagents')
  for (const name of readdirSync(subDir)) {
    if (name.endsWith('.jsonl')) files.push(join(subDir, name))
  }
} catch {}

const byRequest = new Map()
const toolUses = new Map()
const failed = new Set()
let model = null

for (const file of files) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  const isMain = file === main.path
  for (const line of text.split('\n')) {
    if (!line.includes('"usage"') && !line.includes('"tool_use"') && !line.includes('"tool_result"')) continue
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    const message = row?.message
    if (!message) continue
    const content = Array.isArray(message.content) ? message.content : []

    if (row.type === 'assistant') {
      const usage = message.usage
      if (usage) {
        const key = `${message.id ?? row.uuid}|${row.requestId ?? ''}`
        const seen = byRequest.get(key) ?? {}
        for (const field of FIELDS) {
          const value = Number(usage[field]) || 0
          if (!(field in seen) || value > seen[field]) seen[field] = value
        }
        byRequest.set(key, seen)
      }
      if (isMain && typeof message.model === 'string' && !message.model.startsWith('<')) model = message.model
      for (const block of content) {
        if (block?.type === 'tool_use' && typeof block.id === 'string') {
          toolUses.set(block.id, { name: String(block.name ?? 'unknown'), input: block.input ?? {} })
        }
      }
    } else if (row.type === 'user') {
      for (const block of content) {
        if (block?.type === 'tool_result' && block.is_error === true) failed.add(block.tool_use_id)
      }
    }
  }
}

const total = { input: 0, cacheWrite: 0, output: 0, cacheRead: 0 }
for (const u of byRequest.values()) {
  total.input += u.input_tokens ?? 0
  total.cacheWrite += u.cache_creation_input_tokens ?? 0
  total.output += u.output_tokens ?? 0
  total.cacheRead += u.cache_read_input_tokens ?? 0
}

const byTool = {}
const churn = { added: 0, removed: 0, files: 0 }
const touched = new Set()
for (const [useId, use] of toolUses) {
  byTool[use.name] = (byTool[use.name] ?? 0) + 1
  if (failed.has(useId)) continue
  const input = use.input
  let changed = null
  if (use.name === 'Edit') {
    changed = diffCount(input.old_string, input.new_string)
  } else if (use.name === 'MultiEdit' && Array.isArray(input.edits)) {
    changed = { added: 0, removed: 0 }
    for (const edit of input.edits) {
      const one = diffCount(edit?.old_string, edit?.new_string)
      changed.added += one.added
      changed.removed += one.removed
    }
  } else if (use.name === 'Write') {
    changed = { added: lines(input.content).length, removed: 0 }
  }
  if (changed !== null) {
    churn.added += changed.added
    churn.removed += changed.removed
    if (typeof input.file_path === 'string') touched.add(input.file_path)
  }
}
churn.files = touched.size

process.stdout.write(
  JSON.stringify({
    ok: true,
    path: main.path,
    size: main.size,
    mtimeMs: main.mtimeMs,
    files: files.length,
    requests: byRequest.size,
    ...total,
    tools: { total: toolUses.size, byTool },
    churn,
    model,
  }) + '\n',
)
