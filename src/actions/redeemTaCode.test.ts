import { describe, it, expect, vi, beforeEach } from 'vitest'
import { redeemTaCode } from './redeemTaCode.js'

vi.mock('deepspace/worker', () => ({
  timingSafeEqualStrings: (a: string, b: string) => a === b,
}))

function makeTools(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    query: vi.fn().mockResolvedValue({ success: true, data: { records: [] } }),
    create: vi.fn().mockResolvedValue({ success: true }),
    update: vi.fn().mockResolvedValue({ success: true }),
    registerUser: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  }
}

function makeEnv(taJoinCode = 'ohq-ta-2026') {
  return { TA_JOIN_CODE: taJoinCode } as never
}

describe('redeemTaCode', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns invalid_code and never calls registerUser for a wrong code', async () => {
    const tools = makeTools()

    const result = await redeemTaCode({
      userId: 'user-leo',
      params: { code: 'wrong123' },
      tools: tools as never,
      env: makeEnv(),
      callerJwt: 'fake-jwt',
    })

    expect(result).toEqual({ success: false, error: 'invalid_code' })
    expect(tools.registerUser).not.toHaveBeenCalled()
  })

  it('promotes the caller when the correct code is provided', async () => {
    const tools = makeTools()

    const result = await redeemTaCode({
      userId: 'user-leo',
      params: { code: 'ohq-ta-2026' },
      tools: tools as never,
      env: makeEnv(),
      callerJwt: 'fake-jwt',
    })

    expect(result).toEqual({ success: true, data: {} })
    expect(tools.registerUser).toHaveBeenCalledWith({ isAdmin: true })
  })

  it('returns rate_limited and skips registerUser after MAX_ATTEMPTS', async () => {
    const tools = makeTools({
      query: vi.fn().mockResolvedValue({
        success: true,
        data: {
          records: [{ recordId: 'rec-1', data: { key: 'ta_attempts:user-leo', value: '5' } }],
        },
      }),
    })

    const result = await redeemTaCode({
      userId: 'user-leo',
      params: { code: 'ohq-ta-2026' },
      tools: tools as never,
      env: makeEnv(),
      callerJwt: 'fake-jwt',
    })

    expect(result).toEqual({ success: false, error: 'rate_limited' })
    expect(tools.registerUser).not.toHaveBeenCalled()
  })

  it('returns invalid_code when TA_JOIN_CODE is not set', async () => {
    const tools = makeTools()

    const result = await redeemTaCode({
      userId: 'user-leo',
      params: { code: 'ohq-ta-2026' },
      tools: tools as never,
      env: makeEnv(''),
      callerJwt: 'fake-jwt',
    })

    expect(result).toEqual({ success: false, error: 'invalid_code' })
    expect(tools.registerUser).not.toHaveBeenCalled()
  })
})
