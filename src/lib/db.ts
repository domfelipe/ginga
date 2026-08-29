import { neon } from '@neondatabase/serverless';

export function getDb() {
  if (typeof window !== 'undefined') throw new Error('db is server-only');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  return neon(process.env.DATABASE_URL);
}

export type Db = ReturnType<typeof getDb>;
