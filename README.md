# Office Hours Queue

**Live:** https://ohq-groups.app.space

A live office-hours queue that turns students with the same bug into one group help session.

In real office hours, five students often wait 40 minutes each with the same problem. Here, students join with their question, AI spots the ones that are really the same issue, and the TA merges them into one group slot with a single click.

## Try it

**As a student**
1. Sign in and describe your question or bug
2. Watch your position update live
3. If a TA groups you with others, you'll see "You're in a group with N others" - and "A TA is coming" when you're claimed

**As a TA**
1. Sign in, open "I'm a TA" at the bottom, and enter the code: `ohq-ta-2026`
2. Click **Suggest groups** to have AI cluster similar questions
3. Confirm or dismiss each suggestion, remove a student from a group if the AI got it wrong
4. Claim, requeue, or resolve students or whole groups

To see grouping work, join from two accounts with:
- `HashMap resize throws NullPointerException when I call put()`
- `Getting NullPointerException in my HashMap put after resizing`

## How it works

Built on the [DeepSpace SDK](https://docs.deep.space), deployed to Cloudflare Workers.

| Need | DeepSpace primitive |
|---|---|
| Queue updates instantly for everyone | Live records (`useQuery`, RecordRoom) |
| Sign in | Built-in auth |
| Students vs TAs | RBAC: member = student, admin = TA. Permissions enforced server-side |
| TA join code | Server action + `deepspace secrets` |
| Grouping similar questions | `anthropic/chat-completion` integration, called from a TA-only server action |

**Data model**
- `queue_entries` - question, status (waiting / claimed / resolved), groupId, claimedBy, timestamps
- `group_suggestions` - entryIds, reason, status (pending / confirmed / dismissed)

**Permissions**
- Students can create entries and edit/delete only their own, and only the `question` field
- Only TAs can change status, group students, or see AI suggestions
- The AI action checks the caller's role on the server (`resolveAppRole`) before doing anything

**AI safety**
- The AI only suggests; a TA has to confirm
- Student questions are treated as untrusted input. The model output is validated before anything is written: valid JSON, every id exists and is still waiting, 2+ entries per group, no student in two groups
- On confirm, students who left or were helped in the meantime are skipped; if fewer than 2 remain, no group is created

## Run locally

```bash
npm install
npx deepspace auth login
printf %s "your-code" | npx deepspace secrets set TA_JOIN_CODE --stdin
npx deepspace dev start
```

Tests: `npx deepspace test run all`

## Notes
- The app owner is always a TA (DeepSpace pins the owner as admin). Everyone else becomes a TA with the join code
- Wrong TA codes get the same response as right ones (no hints), with a per-user attempt limit
