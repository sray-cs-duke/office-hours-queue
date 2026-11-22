import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { redeemTaCode } from './redeemTaCode.js'

export const actions: Record<string, ActionHandler<Env>> = {
  redeemTaCode,
}
