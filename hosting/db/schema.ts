import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// A revisioned snapshot keeps the order book, reserved funds, fills, and settlement
// atomic. A compare-and-swap update serializes concurrent traders across Workers.
export const markets = sqliteTable('markets', {
  id: text('id').primaryKey(),
  revision: integer('revision').notNull().default(0),
  state: text('state').notNull(),
  updated: integer('updated').notNull(),
});
