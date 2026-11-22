import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { redeemTaCode } from './redeemTaCode.js'
import { suggestGroups } from './suggestGroups.js'

export const actions: Record<string, ActionHandler<Env>> = {
  redeemTaCode,
  suggestGroups,
}
