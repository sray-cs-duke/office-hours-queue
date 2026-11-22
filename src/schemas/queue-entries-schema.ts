import type { CollectionSchema } from 'deepspace/schema'

export const queueEntriesSchema: CollectionSchema = {
  name: 'queue_entries',
  columns: [
    { name: 'question', storage: 'text', interpretation: 'plain', required: true },
    {
      name: 'status',
      storage: 'text',
      interpretation: { kind: 'select', options: ['waiting', 'claimed', 'resolved'] },
      default: 'waiting',
    },
    { name: 'groupId', storage: 'text', interpretation: 'plain' },
    { name: 'claimedBy', storage: 'text', interpretation: 'plain' },
    { name: 'claimedAt', storage: 'text', interpretation: { kind: 'datetime' } },
    { name: 'resolvedAt', storage: 'text', interpretation: { kind: 'datetime' } },
  ],
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    member: {
      read: true,
      create: true,
      update: 'own',
      delete: 'own',
      writableFields: ['question'],
    },
    admin: { read: true, create: false, update: true, delete: true },
  },
}
