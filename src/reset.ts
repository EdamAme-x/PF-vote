import { drizzle } from 'drizzle-orm/bun-sqlite';
import { reset } from 'drizzle-seed';
import * as schema from './schema';

export async function clearDatabase() {
  console.log('Clearing database...');

  const db = drizzle("./vote.db", { schema });
  await db.delete(schema.user);
}

clearDatabase();
