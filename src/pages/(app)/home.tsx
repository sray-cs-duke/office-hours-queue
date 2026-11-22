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

  // All entries — filter client-side so both student and TA views share one subscription
  const { records: allEntries } = useQuery<QueueEntryData>('queue_entries', {
    orderBy: 'createdAt',
    orderDir: 'asc',
  })
  const { put, create, remove, ready } = useMutations<QueueEntryData>('queue_entries')

  const waitingEntries = allEntries.filter((e) => e.data.status === 'waiting')
  const myEntry = allEntries.find((e) => e.createdBy === user?.id)

  // Student join form state
  const [question, setQuestion] = useState('')

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim()) return
    await create({ question: question.trim() })
    setQuestion('')
  }

  // TA action handlers
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

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 text-foreground">
      <h1 className="mb-6 text-2xl font-semibold">Office Hours Queue</h1>

      {/* Student: status of own entry */}
      {!isTA && myEntry && myEntry.data.status === 'claimed' && (
        <div className="mb-6 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground">
          A TA is coming — hang tight!
        </div>
      )}

      {/* Student: join form (hidden once in queue) */}
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

      {/* Queue list */}
      {waitingEntries.length === 0 ? (
        <p className="text-sm text-muted-foreground">The queue is empty.</p>
      ) : (
        <ul className="space-y-2">
          {waitingEntries.map((entry, i) => {
            const isOwn = entry.createdBy === user?.id
            return (
              <li
                key={entry.recordId}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
              >
                <span className="w-8 shrink-0 text-sm font-medium text-muted-foreground">
                  #{i + 1}
                </span>
                <span className="flex-1 text-sm text-foreground">{entry.data.question}</span>
                {isTA ? (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleClaim(entry.recordId)}
                      disabled={!ready}
                    >
                      Claim
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleResolve(entry.recordId)}
                      disabled={!ready}
                    >
                      Resolve
                    </Button>
                  </div>
                ) : (
                  isOwn && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => remove(entry.recordId)}
                      disabled={!ready}
                    >
                      Leave
                    </Button>
                  )
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* TA: claimed entries with Resolve / Requeue */}
      {isTA && (
        <ClaimedSection
          allEntries={allEntries}
          ready={ready}
          onResolve={handleResolve}
          onRequeue={handleRequeue}
        />
      )}

      {/* TA join code form (shown to non-TA signed-in users) */}
      {!isTA && <TaCodeForm onSuccess={refetchUser} />}
    </div>
  )
}

function ClaimedSection({
  allEntries,
  ready,
  onResolve,
  onRequeue,
}: {
  allEntries: ReturnType<typeof useQuery<QueueEntryData>>['records']
  ready: boolean
  onResolve: (id: string) => void
  onRequeue: (id: string) => void
}) {
  const claimed = allEntries.filter((e) => e.data.status === 'claimed')
  if (claimed.length === 0) return null
  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Claimed
      </h2>
      <ul className="space-y-2">
        {claimed.map((entry) => (
          <li
            key={entry.recordId}
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
          >
            <span className="flex-1 text-sm text-foreground">{entry.data.question}</span>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onResolve(entry.recordId)}
                disabled={!ready}
              >
                Resolve
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRequeue(entry.recordId)}
                disabled={!ready}
              >
                Requeue
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TaCodeForm({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const [code, setCode] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim() || state === 'loading') return
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
      const data = (await res.json()) as { success?: boolean }
      if (data.success) {
        setCode('')
        await onSuccess()
        setState('done')
        return
      }
      setState('error')
    } catch {
      setState('error')
    }

    setCode('')
    // Reset feedback after a moment so repeated attempts don't reveal info
    setTimeout(() => setState('idle'), 2000)
  }

  if (state === 'done') return null

  return (
    <details className="mt-10">
      <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
        I&apos;m a TA
      </summary>
      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
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
      {state === 'error' && (
        <p className="mt-2 text-xs text-muted-foreground">Code not recognised.</p>
      )}
    </details>
  )
}
