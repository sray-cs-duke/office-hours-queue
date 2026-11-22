import { describe, it, expect, vi, beforeEach } from 'vitest'
import { suggestGroups } from './suggestGroups.js'
import { resolveAppRole } from 'deepspace/worker'

vi.mock('deepspace/worker', () => ({
  resolveAppRole: vi.fn(),
}))

describe('suggestGroups', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns forbidden when caller is a member', async () => {
    vi.mocked(resolveAppRole).mockResolvedValue('member')

    const result = await suggestGroups({
      userId: 'user-123',
      params: {},
      tools: {} as never,
      env: {} as never,
      callerJwt: 'fake-jwt',
    })

    expect(result).toEqual({ success: false, error: 'forbidden' })
  })
})
