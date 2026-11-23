import { useState } from 'react'
import { useUser, useMutations, useQuery, AuthGate, AuthOverlay, getAuthToken } from 'deepspace'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

type QueueEntryData = {
  question: string
  status?: string
  groupId?: string | null
  claimedBy?: string | null
  claimedAt?: string | null
  resolvedAt?: string | null
}

type GroupSuggestionData = {
  entryIds: string[] | string
  reason: string
  status?: string
  confirmedBy?: string | null
}

type QueueRecord = ReturnType<typeof useQuery<QueueEntryData>>['records'][number]
type SuggestionRecord = ReturnType<typeof useQuery<GroupSuggestionData>>['records'][number]

type QueueItem =
  | { kind: 'solo'; entry: QueueRecord }
  | { kind: 'group'; groupId: string; entries: QueueRecord[]; reason: string }

function parseEntryIds(raw: string[] | string): string[] {
  return Array.isArray(raw) ? raw : JSON.parse(raw as string)
}

function buildGroupedItems(entries: QueueRecord[], groupReasons: Map<string, string>): QueueItem[] {
  const addedGroups = new Set<string>()
  const addedEntries = new Set<string>()
  const items: QueueItem[] = []
  for (const entry of entries) {
    if (addedEntries.has(entry.recordId)) continue
    if (entry.data.groupId) {
      const gid = entry.data.groupId
      if (!addedGroups.has(gid)) {
        addedGroups.add(gid)
        const members = entries.filter((e) => e.data.groupId === gid)
        for (const m of members) addedEntries.add(m.recordId)
        items.push({ kind: 'group', groupId: gid, entries: members, reason: groupReasons.get(gid) ?? '' })
      }
    } else {
      addedEntries.add(entry.recordId)
      items.push({ kind: 'solo', entry })
    }
  }
  return items
}

export default function QueuePage() {
  return (
    <AuthGate fallback={<SignInPrompt />}>
      <Queue />
    </AuthGate>
  )
}

function SignInPrompt() {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 text-center">
        <h1 className="text-lg font-semibold text-foreground">Sign in to join the queue</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to ask a question and see your position.
        </p>
        <Button className="mt-6 w-full" onClick={() => setOpen(true)}>
          Sign in
        </Button>
        {open && <AuthOverlay onClose={() => setOpen(false)} />}
      </div>
    </div>
  )
}

function Queue() {
  const { user, refetch: refetchUser } = useUser()
  const isTA = user?.role === 'admin'

  const { records: allEntries } = useQuery<QueueEntryData>('queue_entries', {
    orderBy: 'createdAt',
    orderDir: 'asc',
  })
  const { put, create, remove, ready } = useMutations<QueueEntryData>('queue_entries')

  const { records: allSuggestions } = useQuery<GroupSuggestionData>('group_suggestions', {
    orderBy: 'createdAt',
    orderDir: 'asc',
  })
  const { put: putSuggestion } = useMutations<GroupSuggestionData>('group_suggestions')

  const waitingEntries = allEntries.filter((e) => e.data.status === 'waiting')
  const claimedEntries = allEntries.filter((e) => e.data.status === 'claimed')
  const myEntry = allEntries.find(
    (e) => e.createdBy === user?.id && (e.data.status === 'waiting' || e.data.status === 'claimed'),
  )
  const pendingSuggestions = allSuggestions.filter((s) => s.data.status === 'pending')

  // groupId (= confirmed suggestion recordId) → reason
  const groupReasons = new Map<string, string>()
  for (const s of allSuggestions) {
    if (s.data.status === 'confirmed') groupReasons.set(s.recordId, s.data.reason)
  }

  const queueItems = buildGroupedItems(waitingEntries, groupReasons)

  // Student: how many others share their group
  const myGroupOthers =
    myEntry?.data.groupId
      ? waitingEntries.filter(
          (e) => e.data.groupId === myEntry.data.groupId && e.recordId !== myEntry.recordId,
        ).length
      : 0

  // Student join form
  const [question, setQuestion] = useState('')

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim()) return
    await create({ question: question.trim() })
    setQuestion('')
  }

  // TA: queue entry handlers
  async function handleClaim(entryId: string) {
    await put(entryId, {
      status: 'claimed',
      claimedBy: user?.id ?? null,
      claimedAt: new Date().toISOString(),
    })
  }

  async function handleResolve(entryId: string) {
    await put(entryId, { status: 'resolved', resolvedAt: new Date().toISOString() })
  }

  async function handleRequeue(entryId: string) {
    await put(entryId, { status: 'waiting', claimedBy: null, claimedAt: null })
  }

  // TA: group handlers (waiting queue)
  async function handleClaimGroup(entries: QueueRecord[]) {
    await Promise.all(
      entries.map((e) =>
        put(e.recordId, {
          status: 'claimed',
          claimedBy: user?.id ?? null,
          claimedAt: new Date().toISOString(),
        }),
      ),
    )
  }

  async function handleResolveGroup(entries: QueueRecord[]) {
    await Promise.all(
      entries.map((e) => put(e.recordId, { status: 'resolved', resolvedAt: new Date().toISOString() })),
    )
  }

  async function handleRemoveFromGroup(entryId: string) {
    await put(entryId, { groupId: null })
  }

  // TA: group handlers (claimed section)
  async function handleRequeueGroup(entries: QueueRecord[]) {
    await Promise.all(
      entries.map((e) => put(e.recordId, { status: 'waiting', claimedBy: null, claimedAt: null })),
    )
  }

  // TA: AI suggestions
  const [suggestState, setSuggestState] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle')

  async function handleSuggestGroups() {
    setSuggestState('loading')
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 30_000),
    )
    try {
      const jwt = await getAuthToken()
      const res = await Promise.race([
        fetch('/api/actions/suggestGroups', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
          body: JSON.stringify({}),
        }),
        timeout,
      ])
      const data = (await res.json()) as { success?: boolean; data?: { count?: number }; error?: string }
      if (data.success && (data.data?.count ?? 0) === 0) {
        setSuggestState('empty')
        setTimeout(() => setSuggestState('idle'), 3000)
      } else {
        setSuggestState('idle')
      }
    } catch {
      setSuggestState('error')
      setTimeout(() => setSuggestState('idle'), 3000)
    }
  }

  async function handleConfirmSuggestion(suggestion: SuggestionRecord) {
    const ids = parseEntryIds(suggestion.data.entryIds)
    const stillWaiting = ids.filter((id) =>
      allEntries.find((e) => e.recordId === id)?.data.status === 'waiting',
    )

    if (stillWaiting.length < 2) {
      await putSuggestion(suggestion.recordId, { status: 'dismissed' })
      return
    }

    const groupId = suggestion.recordId
    await Promise.all(stillWaiting.map((id) => put(id, { groupId })))
    await putSuggestion(suggestion.recordId, {
      status: 'confirmed',
      confirmedBy: user?.id ?? null,
    })
  }

  async function handleDismissSuggestion(suggestionId: string) {
    await putSuggestion(suggestionId, { status: 'dismissed' })
  }

  const ungroupedWaiting = waitingEntries.filter((e) => !e.data.groupId).length

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 text-foreground">
      <h1 className="mb-1 text-2xl font-semibold">Office Hours Queue</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Students with the same bug get helped together.
      </p>

      {/* Student: claimed banner */}
      {!isTA && myEntry?.data.status === 'claimed' && (
        <div className="mb-6 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground">
          A TA is coming — hang tight!
        </div>
      )}

      {/* Student: grouped banner */}
      {!isTA && myEntry?.data.groupId && myGroupOthers > 0 && (
        <div className="mb-4 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground">
          You&apos;re in a group with {myGroupOthers}{' '}
          {myGroupOthers === 1 ? 'other' : 'others'} with the same issue.
        </div>
      )}

      {/* Student: join form */}
      {!isTA && !myEntry && (
        <form onSubmit={handleJoin} className="mb-8 flex gap-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Describe your question or bug..."
            disabled={!ready}
            className="flex-1"
          />
          <Button type="submit" disabled={!ready || !question.trim()}>
            Join Queue
          </Button>
        </form>
      )}

      {/* TA: suggest groups button */}
      {isTA && (
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {suggestState === 'empty'
              ? 'No similar questions right now.'
              : suggestState === 'error'
                ? 'Something went wrong — try again.'
                : pendingSuggestions.length > 0
                  ? `${pendingSuggestions.length} pending suggestion${pendingSuggestions.length > 1 ? 's' : ''}`
                  : ''}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSuggestGroups}
            disabled={suggestState === 'loading' || ungroupedWaiting < 2 || !ready}
          >
            {suggestState === 'loading' ? 'Thinking…' : 'Suggest groups'}
          </Button>
        </div>
      )}

      {/* TA: pending AI suggestions */}
      {isTA && pendingSuggestions.length > 0 && (
        <SuggestionsPanel
          suggestions={pendingSuggestions}
          allEntries={allEntries}
          ready={ready}
          onConfirm={handleConfirmSuggestion}
          onDismiss={handleDismissSuggestion}
        />
      )}

      {/* Queue list */}
      {queueItems.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {claimedEntries.length > 0 ? 'No one waiting.' : 'The queue is empty.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {queueItems.map((item, i) =>
            item.kind === 'solo' ? (
              <li
                key={item.entry.recordId}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
              >
                <span className="w-8 shrink-0 text-sm font-medium text-muted-foreground">
                  #{i + 1}
                </span>
                <span className="flex-1 text-sm text-foreground">{item.entry.data.question}</span>
                {isTA ? (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleClaim(item.entry.recordId)}
                      disabled={!ready}
                    >
                      Claim
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleResolve(item.entry.recordId)}
                      disabled={!ready}
                    >
                      Resolve
                    </Button>
                  </div>
                ) : (
                  item.entry.createdBy === user?.id && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => remove(item.entry.recordId)}
                      disabled={!ready}
                    >
                      Leave
                    </Button>
                  )
                )}
              </li>
            ) : (
              <GroupCard
                key={item.groupId}
                position={i + 1}
                entries={item.entries}
                reason={item.reason}
                isTA={isTA}
                currentUserId={user?.id}
                ready={ready}
                onClaimGroup={handleClaimGroup}
                onResolveGroup={handleResolveGroup}
                onRemoveFromGroup={handleRemoveFromGroup}
                onLeave={remove}
              />
            ),
          )}
        </ul>
      )}

      {/* TA: claimed entries */}
      {isTA && (
        <ClaimedSection
          allEntries={allEntries}
          groupReasons={groupReasons}
          ready={ready}
          onResolve={handleResolve}
          onRequeue={handleRequeue}
          onResolveGroup={handleResolveGroup}
          onRequeueGroup={handleRequeueGroup}
        />
      )}

      {/* TA join code form (hidden once user is a TA) */}
      {!isTA && <TaCodeForm onSuccess={refetchUser} />}
    </div>
  )
}

function GroupCard({
  position,
  entries,
  reason,
  isTA,
  currentUserId,
  ready,
  onClaimGroup,
  onResolveGroup,
  onRemoveFromGroup,
  onLeave,
}: {
  position: number
  entries: QueueRecord[]
  reason: string
  isTA: boolean
  currentUserId: string | undefined
  ready: boolean
  onClaimGroup: (entries: QueueRecord[]) => void
  onResolveGroup: (entries: QueueRecord[]) => void
  onRemoveFromGroup: (entryId: string) => void
  onLeave: (entryId: string) => void
}) {
  return (
    <li className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="mb-2 flex items-start gap-3">
        <span className="mt-0.5 w-8 shrink-0 text-sm font-medium text-muted-foreground">
          #{position}
        </span>
        <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {reason || 'Group'}
          </span>
          {isTA && (
            <div className="flex shrink-0 gap-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onClaimGroup(entries)}
                disabled={!ready}
              >
                Claim group
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onResolveGroup(entries)}
                disabled={!ready}
              >
                Resolve group
              </Button>
            </div>
          )}
        </div>
      </div>
      <ul className="ml-11 space-y-1">
        {entries.map((e) => (
          <li key={e.recordId} className="flex items-center gap-2">
            <span className="flex-1 text-sm text-foreground">{e.data.question}</span>
            {isTA ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemoveFromGroup(e.recordId)}
                disabled={!ready}
              >
                Remove from group
              </Button>
            ) : (
              e.createdBy === currentUserId && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onLeave(e.recordId)}
                  disabled={!ready}
                >
                  Leave
                </Button>
              )
            )}
          </li>
        ))}
      </ul>
    </li>
  )
}

function SuggestionsPanel({
  suggestions,
  allEntries,
  ready,
  onConfirm,
  onDismiss,
}: {
  suggestions: SuggestionRecord[]
  allEntries: QueueRecord[]
  ready: boolean
  onConfirm: (s: SuggestionRecord) => void
  onDismiss: (id: string) => void
}) {
  return (
    <div className="mb-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        AI Group Suggestions
      </h2>
      <ul className="space-y-3">
        {suggestions.map((s) => {
          const ids = parseEntryIds(s.data.entryIds)
          const entries = ids
            .map((id) => allEntries.find((e) => e.recordId === id))
            .filter((e): e is QueueRecord => e !== undefined)
          return (
            <li key={s.recordId} className="rounded-lg border border-border bg-card px-4 py-3">
              <p className="mb-2 text-sm font-medium text-foreground">{s.data.reason}</p>
              <ul className="mb-3 space-y-1">
                {entries.map((e) => (
                  <li key={e.recordId} className="text-xs text-muted-foreground">
                    — {e.data.question}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => onConfirm(s)} disabled={!ready}>
                  Confirm
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDismiss(s.recordId)}
                  disabled={!ready}
                >
                  Dismiss
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ClaimedSection({
  allEntries,
  groupReasons,
  ready,
  onResolve,
  onRequeue,
  onResolveGroup,
  onRequeueGroup,
}: {
  allEntries: QueueRecord[]
  groupReasons: Map<string, string>
  ready: boolean
  onResolve: (id: string) => void
  onRequeue: (id: string) => void
  onResolveGroup: (entries: QueueRecord[]) => void
  onRequeueGroup: (entries: QueueRecord[]) => void
}) {
  const claimed = allEntries.filter((e) => e.data.status === 'claimed')
  if (claimed.length === 0) return null

  const items = buildGroupedItems(claimed, groupReasons)

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Claimed
      </h2>
      <ul className="space-y-2">
        {items.map((item) =>
          item.kind === 'solo' ? (
            <li
              key={item.entry.recordId}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <span className="flex-1 text-sm text-foreground">{item.entry.data.question}</span>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onResolve(item.entry.recordId)}
                  disabled={!ready}
                >
                  Resolve
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRequeue(item.entry.recordId)}
                  disabled={!ready}
                >
                  Requeue
                </Button>
              </div>
            </li>
          ) : (
            <li
              key={item.groupId}
              className="rounded-lg border border-border bg-card px-4 py-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {item.reason || 'Group'}
                </span>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onResolveGroup(item.entries)}
                    disabled={!ready}
                  >
                    Resolve group
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRequeueGroup(item.entries)}
                    disabled={!ready}
                  >
                    Requeue group
                  </Button>
                </div>
              </div>
              <ul className="space-y-1">
                {item.entries.map((e) => (
                  <li key={e.recordId} className="text-sm text-foreground">
                    — {e.data.question}
                  </li>
                ))}
              </ul>
            </li>
          ),
        )}
      </ul>
    </div>
  )
}

function TaCodeForm({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const [code, setCode] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'submitted' | 'limited'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim() || state === 'loading' || state === 'limited') return
    setState('loading')

    try {
      const jwt = await getAuthToken()
      const res = await fetch('/api/actions/redeemTaCode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
        body: JSON.stringify({ code: code.trim() }),
      })
      const data = (await res.json()) as { success?: boolean; error?: string }
      if (data.error === 'rate_limited') {
        setState('limited')
        return
      }
      if (data.success) {
        void onSuccess() // role change arrives via WebSocket; don't await
      }
    } catch {}

    // Wrong code, success (pre-unmount), or network error — show message briefly
    setCode('')
    setState('submitted')
    setTimeout(() => setState('idle'), 3_000)
  }

  return (
    <details className="mt-10">
      <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
        I&apos;m a TA
      </summary>
      {state === 'limited' ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Too many attempts. Ask your instructor for help.
        </p>
      ) : (
        <div className="mt-3">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter TA code"
              disabled={state === 'loading'}
              className="flex-1"
              autoComplete="off"
            />
            <Button type="submit" disabled={state === 'loading' || !code.trim()}>
              {state === 'loading' ? 'Checking…' : 'Submit'}
            </Button>
          </form>
          {state === 'submitted' && (
            <p className="mt-2 text-xs text-muted-foreground">
              Code submitted. If it&apos;s valid, TA tools will appear.
            </p>
          )}
        </div>
      )}
    </details>
  )
}
