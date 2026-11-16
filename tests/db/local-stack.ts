import { execSync } from 'node:child_process'

export type LocalStack = { apiUrl: string; anonKey: string; dbUrl: string }

/**
 * Connection details of the LOCAL Supabase stack, read from `supabase status`.
 * Refuses anything that is not on this machine, so these tests can never be
 * pointed at a hosted project by accident.
 */
export function localStack(): LocalStack {
  const out = execSync('npx supabase status -o env', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const env = Object.fromEntries(
    out
      .split('\n')
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => [m[1], m[2]]),
  )
  const stack = { apiUrl: env.API_URL, anonKey: env.ANON_KEY, dbUrl: env.DB_URL }
  if (!stack.apiUrl || !stack.anonKey || !stack.dbUrl) {
    throw new Error('Local Supabase is not running. Start it with: npx supabase start')
  }
  for (const url of [stack.apiUrl, stack.dbUrl]) {
    const host = new URL(url).hostname
    if (host !== '127.0.0.1' && host !== 'localhost') {
      throw new Error(`Refusing to run database tests against non-local host ${host}`)
    }
  }
  return stack
}
