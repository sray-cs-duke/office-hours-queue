import { useState } from 'react'
import { useUser, useMutations, useQuery, AuthGate, AuthOverlay } from 'deepspace'
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
  const { user } = useUser()
  const { records: entries } = useQuery<QueueEntryData>('queue_entries', {
    where: { status: 'waiting' },
    orderBy: 'createdAt',
    orderDir: 'asc',
  })
  const { create, remove, ready } = useMutations<QueueEntryData>('queue_entries')
  const [question, setQuestion] = useState('')

  const myEntry = entries.find((e) => e.createdBy === user?.id)

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim()) return
    await create({ question: question.trim() })
    setQuestion('')
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 text-foreground">
      <h1 className="mb-6 text-2xl font-semibold">Office Hours Queue</h1>

      {!myEntry && (
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

      {myEntry && (
        <div className="mb-8 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          You&apos;re in the queue. Leave any time with the button on your entry below.
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">The queue is empty — join to be first!</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry, i) => {
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
                {isOwn && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => remove(entry.recordId)}
                    disabled={!ready}
                  >
                    Leave
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
