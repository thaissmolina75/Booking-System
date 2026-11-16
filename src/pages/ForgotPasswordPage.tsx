import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthShell } from '@/components/app/AuthShell'
import { Field } from '@/components/app/Field'
import { Notice } from '@/components/app/Notice'
import { Button } from '@/components/ui/button'
import { errorText } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

export function ForgotPasswordPage() {
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: new URL('/reset-password', window.location.origin).toString(),
    })
    setBusy(false)
    if (error) setError(errorText(error))
    else setSent(true)
  }

  return (
    <AuthShell
      title="Reset your password"
      intro="Enter your email and we will send you a link to choose a new password."
      footer={
        <Link className="font-semibold text-primary underline-offset-4 hover:underline" to="/login">
          Back to log in
        </Link>
      }
    >
      {sent ? (
        <Notice tone="success" title="Check your email">
          If an account exists for {email.trim()}, a reset link is on its way.
        </Notice>
      ) : (
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
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button type="submit" size="touch" disabled={busy || !email}>
            {busy ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
