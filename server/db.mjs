import pg from 'pg';
let pool;
export function connectionOptions(value){
 const url=new URL(value);
 if(!['postgres:','postgresql:'].includes(url.protocol)||url.searchParams.get('sslmode')!=='verify-full')throw new Error('DATABASE_URL must use PostgreSQL with sslmode=verify-full');
 return {connectionString:value,max:3,connectionTimeoutMillis:5000,idleTimeoutMillis:10000};
}
export function database() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('Database is not configured');
    pool = new pg.Pool(connectionOptions(process.env.DATABASE_URL));
    pool.on('error', () => console.error('Database connection failed'));
  }
  return pool;
}
export async function transaction(pool, fn) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
