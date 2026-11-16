import { MailCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { safeNextPath } from '@/auth/access'
import { SignedOutOnly } from '@/auth/guards'
import { AuthShell } from '@/components/app/AuthShell'
import { Field } from '@/components/app/Field'
import { callbackUrl, GoogleButton, OrDivider } from '@/components/app/GoogleButton'
import { Notice } from '@/components/app/Notice'
import { Button } from '@/components/ui/button'
import { errorText } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

export function SignupPage() {
  const [params] = useSearchParams()
  const next = safeNextPath(params.get('next'))
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const suffix = params.toString() ? `?${params.toString()}` : ''

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password.length < 8) {
      setError('Choose a password with at least 8 characters.')
      return
    }
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() }, emailRedirectTo: callbackUrl(next) },
    })
    setBusy(false)
    if (error) {
      setError(errorText(error))
      return
    }
    // With email confirmation on there is no session yet: the link finishes it.
    if (!data.session) setSentTo(email.trim())
  }

  return (
    <SignedOutOnly next={next}>
      {sentTo ? (
        <AuthShell
          title="Check your email"
          intro={
            <>
              We sent a confirmation link to <strong className="text-foreground">{sentTo}</strong>. Open it on
              this device to finish creating your account.
            </>
          }
          footer={
            <Link className="font-semibold text-primary underline-offset-4 hover:underline" to={`/login${suffix}`}>
              Back to log in
            </Link>
          }
        >
          <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
            <MailCheck className="size-6 shrink-0 text-primary" aria-hidden />
            <p className="text-[0.95rem]">No email after a few minutes? Check spam, or sign up again.</p>
          </div>
        </AuthShell>
      ) : (
        <AuthShell
          title="Create your account"
          intro="An account alone gives no access. A business owner or your provider links it with an invite."
          footer={
            <>
              Already have an account?{' '}
              <Link className="font-semibold text-primary underline-offset-4 hover:underline" to={`/login${suffix}`}>
                Log in
              </Link>
            </>
          }
        >
          <GoogleButton next={next} />
          <OrDivider />
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <Field
              label="Your name"
              name="name"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
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
              name="new-password"
              autoComplete="new-password"
              hint="At least 8 characters."
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Button type="submit" size="touch" disabled={busy || !email || !password || !fullName.trim()}>
              {busy ? 'Creating account…' : 'Create account'}
            </Button>
          </form>
        </AuthShell>
      )}
    </SignedOutOnly>
  )
}
