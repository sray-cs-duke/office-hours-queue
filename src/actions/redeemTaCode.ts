import { timingSafeEqualStrings } from 'deepspace/worker'
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'

const MAX_ATTEMPTS = 5
const ATTEMPTS_KEY_PREFIX = 'ta_attempts:'

export const redeemTaCode: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  // Read current attempt count from settings (admin-only collection; client can't write it)
  const attemptsKey = `${ATTEMPTS_KEY_PREFIX}${userId}`
  const attemptsResult = await tools.query<{ key: string; value: string }>('settings', {
    where: { key: attemptsKey },
    limit: 1,
  })

  const attemptRecord = attemptsResult.success ? attemptsResult.data.records[0] : undefined
  const attempts = attemptRecord ? parseInt(attemptRecord.data.value, 10) : 0

  // Increment before checking the code — same response path for right and wrong
  const newAttempts = attempts + 1
  if (attemptRecord) {
    await tools.update('settings', attemptRecord.recordId, { value: String(newAttempts) })
  } else {
    await tools.create('settings', { key: attemptsKey, value: String(newAttempts) })
  }

  // Rate limit: same generic response as a wrong code — don't reveal the limit was hit
  if (attempts >= MAX_ATTEMPTS) {
    return { success: false, error: 'invalid_code' }
  }

  const code = typeof params.code === 'string' ? params.code : ''
  const secret = env.TA_JOIN_CODE ?? ''
  if (!secret || !timingSafeEqualStrings(code, secret)) {
    return { success: false, error: 'invalid_code' }
  }

  // Promote the caller — registerUser defaults userId to the action's caller
  const result = await tools.registerUser({ isAdmin: true })
  if (!result.success) {
    return { success: false, error: 'invalid_code' }
  }

  return { success: true, data: {} }
}
