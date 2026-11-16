import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { AuthShell } from '@/components/app/AuthShell'
import { Field } from '@/components/app/Field'
import { FullPageSpinner } from '@/components/app/FullPageSpinner'
import { Notice } from '@/components/app/Notice'
import { Button } from '@/components/ui/button'
import { errorText } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

/** Reached from the reset email. The link signs the user in; this sets the new password. */
export function ResetPasswordPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session === undefined) return <FullPageSpinner />

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password.length < 8) {
      setError('Choose a password with at least 8 characters.')
      return
    }
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(errorText(error))
      setBusy(false)
      return
    }
    navigate('/', { replace: true })
  }

  if (session === null) {
    return (
      <AuthShell title="This reset link no longer works">
        <Notice tone="error">The link has expired or was already used. Request a new one.</Notice>
        <Link
          className="py-2 font-semibold text-primary underline-offset-4 hover:underline"
          to="/forgot-password"
        >
          Send a new reset link
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Choose a new password" intro={`For ${session.user.email}`}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field
          label="New password"
          type="password"
          name="new-password"
          autoComplete="new-password"
          hint="At least 8 characters."
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button type="submit" size="touch" disabled={busy || !password}>
          {busy ? 'Saving…' : 'Save new password'}
        </Button>
      </form>
    </AuthShell>
  )
}
