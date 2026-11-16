import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { inviteTokenFromPath } from '@/auth/access'
import { useAuth } from '@/auth/AuthProvider'
import { AuthShell } from '@/components/app/AuthShell'
import { FullPageSpinner } from '@/components/app/FullPageSpinner'
import { Notice } from '@/components/app/Notice'
import { Button, buttonVariants } from '@/components/ui/button'
import { errorCode, errorText } from '@/lib/errors'
import { lastBusiness, pendingInvite } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

export function InvitePage() {
  const { token: rawToken } = useParams()
  const token = inviteTokenFromPath(`/invite/${rawToken ?? ''}`)
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const started = useRef(false)

  // Keep the invite through sign-up, email confirmation and Google redirects.
  useEffect(() => {
    if (token) pendingInvite.set(token)
  }, [token])

  const preview = useQuery({
    queryKey: ['invite-preview', token],
    enabled: token !== null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_invite_preview', { p_token: token! })
      if (error) throw error
      return data[0] ?? null
    },
  })

  const accept = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('accept_invite', { p_token: token! })
      if (error) throw error
      return data
    },
    onSuccess: async (membership) => {
      pendingInvite.clear()
      if (session) lastBusiness.set(session.user.id, membership.business_id)
      await queryClient.invalidateQueries({ queryKey: ['access'] })
      navigate('/dashboard', { replace: true })
    },
    onError: (error) => {
      // A dead invite should not keep pulling the user back here.
      const code = errorCode(error)
      if (code === 'invite_already_used' || code === 'invite_expired' || code === 'invite_not_found') {
        pendingInvite.clear()
      }
    },
  })

  const invite = preview.data
  const signedInEmail = session?.user.email ?? null
  const emailMatches =
    invite && signedInEmail ? invite.email.toLowerCase() === signedInEmail.toLowerCase() : false
  const canAccept = Boolean(session && invite?.state === 'valid' && emailMatches)

  useEffect(() => {
    if (canAccept && !started.current) {
      started.current = true
      accept.mutate()
    }
  }, [canAccept, accept])

  if (!token) {
    return (
      <AuthShell title="This invite link is not valid">
        <Notice tone="error">Check that you opened the full link from your invite.</Notice>
        <HomeLink />
      </AuthShell>
    )
  }
  if (session === undefined || preview.isPending) return <FullPageSpinner label="Checking your invite" />

  if (preview.isError) {
    return (
      <AuthShell title="Could not check your invite">
        <Notice tone="error">{errorText(preview.error)}</Notice>
        <Button size="touch" onClick={() => void preview.refetch()}>
          Try again
        </Button>
      </AuthShell>
    )
  }

  if (!invite || invite.state !== 'valid') {
    pendingInvite.clear()
    // Someone who already accepted and reopened the link belongs in the app.
    if (invite?.state === 'used' && session && emailMatches) return <Navigate to="/" replace />
    const title = !invite
      ? 'This invite link is not valid'
      : invite.state === 'used'
        ? 'This invite has already been used'
        : 'This invite has expired'
    return (
      <AuthShell title={title}>
        <Notice tone="error">
          {!invite
            ? 'Check that you opened the full link from your invite.'
            : `Ask ${invite.business_name} to send you a new invite.`}
        </Notice>
        <HomeLink />
      </AuthShell>
    )
  }

  const roleLabel = invite.role === 'owner' ? 'an owner' : 'staff'
  const next = encodeURIComponent(`/invite/${token}`)
  const email = encodeURIComponent(invite.email)

  if (!session) {
    return (
      <AuthShell
        title={`Join ${invite.business_name}`}
        intro={`You have been invited as ${roleLabel}. Sign in first, then you will be added automatically.`}
      >
        <p className="rounded-xl border bg-card p-4 text-[0.95rem]">
          Use <strong className="break-all">{invite.email}</strong>. The invite only works with this email
          address.
        </p>
        <Link className={cn(buttonVariants({ size: 'touch' }))} to={`/signup?next=${next}&email=${email}`}>
          Create an account
        </Link>
        <Link
          className={cn(buttonVariants({ size: 'touch', variant: 'outline' }), 'bg-card')}
          to={`/login?next=${next}&email=${email}`}
        >
          I already have an account
        </Link>
      </AuthShell>
    )
  }

  if (!emailMatches) {
    return (
      <AuthShell title="This invite is for a different email">
        <Notice tone="error" title="Email does not match">
          This invite was sent to <strong className="break-all">{invite.email}</strong>, but you are signed in
          as <strong className="break-all">{signedInEmail}</strong>.
        </Notice>
        <p className="text-muted-foreground">
          Sign out, then sign in with {invite.email} to join {invite.business_name}.
        </p>
        <Button size="touch" onClick={() => void signOut({ stay: true })}>
          Sign out and switch account
        </Button>
      </AuthShell>
    )
  }

  if (accept.isError) {
    return (
      <AuthShell title={`Could not join ${invite.business_name}`}>
        <Notice tone="error">{errorText(accept.error)}</Notice>
        <Button size="touch" onClick={() => accept.mutate()}>
          Try again
        </Button>
        <HomeLink />
      </AuthShell>
    )
  }

  return <FullPageSpinner label={`Joining ${invite.business_name}`} />
}

function HomeLink() {
  return (
    <Link className="py-2 font-semibold text-primary underline-offset-4 hover:underline" to="/">
      Go to the app
    </Link>
  )
}
