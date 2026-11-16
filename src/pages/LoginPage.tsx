import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { safeNextPath } from '@/auth/access'
import { SignedOutOnly } from '@/auth/guards'
import { AuthShell } from '@/components/app/AuthShell'
import { Field } from '@/components/app/Field'
import { GoogleButton, OrDivider } from '@/components/app/GoogleButton'
import { Notice } from '@/components/app/Notice'
import { Button } from '@/components/ui/button'
import { errorText } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

export function LoginPage() {
  const [params] = useSearchParams()
  const next = safeNextPath(params.get('next'))
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const suffix = params.toString() ? `?${params.toString()}` : ''

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    // On success the session changes and SignedOutOnly moves the user on.
    if (error) {
      setError(errorText(error))
      setBusy(false)
    }
  }

  return (
    <SignedOutOnly next={next}>
      <AuthShell
        title="Log in"
        intro={params.get('reset') === 'done' ? undefined : 'Manage your bookings and seats.'}
        footer={
          <>
            New here?{' '}
            <Link className="font-semibold text-primary underline-offset-4 hover:underline" to={`/signup${suffix}`}>
              Create an account
            </Link>
          </>
        }
      >
        {params.get('confirmed') === '1' ? (
          <Notice tone="success">Email confirmed. Log in to continue.</Notice>
        ) : null}
        <GoogleButton next={next} />
        <OrDivider />
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button type="submit" size="touch" disabled={busy || !email || !password}>
            {busy ? 'Logging in…' : 'Log in'}
          </Button>
          <Link
            className="self-start py-2 font-medium text-primary underline-offset-4 hover:underline"
            to={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`}
          >
            Forgot your password?
          </Link>
        </form>
      </AuthShell>
    </SignedOutOnly>
  )
}
