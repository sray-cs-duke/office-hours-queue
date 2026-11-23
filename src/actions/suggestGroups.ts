import { resolveAppRole } from 'deepspace/worker'
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'

type QueueEntryRecord = { question: string; status: string; groupId?: string | null }
type AnthropicResponse = { content: Array<{ type: string; text?: string }> }

export const suggestGroups: ActionHandler<Env> = async ({ userId, tools, env }) => {
  const role = await resolveAppRole(env, userId)
  if (role !== 'admin') {
    return { success: false, error: 'forbidden' }
  }

  const entriesResult = await tools.query<QueueEntryRecord>('queue_entries', {
    where: { status: 'waiting' },
    limit: 200,
  })
  if (!entriesResult.success) {
    return { success: false, error: 'query_failed' }
  }

  const ungrouped = entriesResult.data.records.filter((r) => !r.data.groupId)
  if (ungrouped.length < 2) {
    return { success: true, data: { count: 0 } }
  }

  const entryList = ungrouped.map((r) => `id:${r.recordId} question:${r.data.question}`).join('\n')

  const aiResult = await tools.integration<AnthropicResponse>('anthropic/chat-completion', {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system:
      'You are helping a teaching assistant manage an office hours queue. Given a list of student questions, identify groups of 2 or more that share the same underlying bug or concept. Reply with ONLY a raw JSON array — no code fences, no explanation, no text before or after. Format: [{ "entryIds": ["id1","id2"], "reason": "shared issue in 10 words or less" }]. Only include groups of 2+. Singletons must not appear. If nothing should be grouped, reply with exactly: []',
    messages: [{ role: 'user', content: entryList }],
  })

  if (!aiResult.success) {
    return { success: false, error: 'ai_failed' }
  }

  const rawText = aiResult.data.content.find((b) => b.type === 'text')?.text ?? ''
  // Strip code fences anywhere in the response
  const stripped = rawText.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    // Fall back: extract the first [...] substring and retry
    const start = stripped.indexOf('[')
    const end = stripped.lastIndexOf(']')
    if (start !== -1 && end > start) {
      try {
        parsed = JSON.parse(stripped.slice(start, end + 1))
      } catch {
        return { success: false, error: 'ai_invalid_json' }
      }
    } else {
      return { success: false, error: 'ai_invalid_json' }
    }
  }

  if (!Array.isArray(parsed)) {
    return { success: false, error: 'ai_invalid_json' }
  }

  const validIds = new Set(ungrouped.map((r) => r.recordId))
  const seen = new Set<string>()
  const valid: { entryIds: string[]; reason: string }[] = []

  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue
    const rawIds = (item as Record<string, unknown>).entryIds
    const rawReason = (item as Record<string, unknown>).reason
    if (!Array.isArray(rawIds) || typeof rawReason !== 'string') continue

    const ids = rawIds.filter(
      (id: unknown): id is string => typeof id === 'string' && validIds.has(id) && !seen.has(id),
    )
    if (ids.length < 2) continue

    for (const id of ids) seen.add(id)
    valid.push({ entryIds: ids, reason: rawReason.trim().slice(0, 200) })
  }

  // Dismiss any existing pending suggestions before writing new ones
  const oldResult = await tools.query<{ status: string }>('group_suggestions', {
    where: { status: 'pending' },
    limit: 50,
  })
  if (oldResult.success) {
    for (const rec of oldResult.data.records) {
      await tools.update('group_suggestions', rec.recordId, { status: 'dismissed' })
    }
  }

  for (const { entryIds, reason } of valid) {
    await tools.create('group_suggestions', {
      entryIds: JSON.stringify(entryIds),
      reason,
    })
  }

  return { success: true, data: { count: valid.length } }
}
