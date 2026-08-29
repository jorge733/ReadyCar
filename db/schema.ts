import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const documents = sqliteTable('documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(), type: text('type').notNull(), vehicle: text('vehicle').notNull(), plate: text('plate').notNull(),
  expirationDate: text('expiration_date').notNull(), fileName: text('file_name'), fileKey: text('file_key'), createdAt: text('created_at').notNull(),
});
