import type { CollectionSchema } from 'deepspace/schema'

export const announcementsSchema: CollectionSchema = {
  name: 'announcements',
  columns: [
    { name: 'body', storage: 'text', interpretation: 'plain', required: true },
  ],
  permissions: {
    '*': { read: true, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
