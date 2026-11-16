#!/usr/bin/env node
/**
 * Fails if the built app (dist/) contains anything that must stay on a server:
 * a service-role or secret key, the JWT signing secret, or any token whose
 * role is not "anon". Run after `npm run build`.
 */
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

const problems = []
const texts = files('dist')
  .filter((f) => /\.(js|css|html|map|json|txt)$/.test(f))
  .map((f) => [f, readFileSync(f, 'utf8')])

// 1. Any JWT in the bundle must be an anon key.
let tokens = 0
for (const [file, text] of texts) {
  for (const token of text.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) ?? []) {
    tokens += 1
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    if (payload.role !== 'anon') problems.push(`${file}: contains a JWT with role "${payload.role}"`)
  }
  // 2. New-style Supabase secret keys.
  if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(text)) problems.push(`${file}: contains an sb_secret_ key`)
  // 3. Server-only variable names should never be referenced by client code.
  for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'SERVICE_ROLE_KEY', 'SUPABASE_JWT_SECRET', 'GOOGLE_SECRET', 'DATABASE_URL']) {
    if (text.includes(name)) problems.push(`${file}: mentions ${name}`)
  }
}

// 4. If the local stack is running, check its actual secrets byte for byte.
let checkedLocal = 0
try {
  const env = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  for (const line of env.split('\n')) {
    const match = line.match(/^(SERVICE_ROLE_KEY|SECRET_KEY|JWT_SECRET|S3_PROTOCOL_ACCESS_KEY_SECRET)="?(.*?)"?$/)
    if (!match || !match[2]) continue
    checkedLocal += 1
    for (const [file, text] of texts) if (text.includes(match[2])) problems.push(`${file}: contains the local ${match[1]}`)
  }
} catch {
  // Local stack not running: the pattern checks above still apply.
}

// 5. Source must not read server-only variables either.
for (const file of files('src')) {
  const text = readFileSync(file, 'utf8')
  if (/service_role|SERVICE_ROLE|sb_secret_/.test(text) && !file.endsWith('database.types.ts')) {
    problems.push(`${file}: source mentions a service-role or secret key`)
  }
}

console.log(`Checked ${texts.length} built files: ${tokens} JWT(s) found, ${checkedLocal} local secret(s) compared.`)
if (problems.length > 0) {
  console.error('\nSecrets check FAILED:\n- ' + problems.join('\n- '))
  process.exit(1)
}
console.log('Secrets check passed: only the anon key is in the client bundle.')
