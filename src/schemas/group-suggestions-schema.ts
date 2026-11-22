import type { CollectionSchema } from 'deepspace/schema'

export const groupSuggestionsSchema: CollectionSchema = {
  name: 'group_suggestions',
  columns: [
    { name: 'entryIds', storage: 'text', interpretation: 'json', required: true },
    { name: 'reason', storage: 'text', interpretation: 'plain', required: true },
    {
      name: 'status',
      storage: 'text',
      interpretation: { kind: 'select', options: ['pending', 'confirmed', 'dismissed'] },
      default: 'pending',
    },
    { name: 'confirmedBy', storage: 'text', interpretation: 'plain' },
  ],
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    member: { read: false, create: false, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
