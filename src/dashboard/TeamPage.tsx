import { Copy, MailPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { PageHeader, SelectField } from '@/components/app/controls'
import { Field } from '@/components/app/Field'
import { Notice } from '@/components/app/Notice'
import { Button } from '@/components/ui/button'
import { errorText } from '@/lib/errors'
import { inviteLink, useCreateInvite, useInvites, useRemoveMember, useRevokeInvite, useTeam, type Invite } from './api'
import { useBusiness } from './BusinessProvider'

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} copied`)
  } catch {
    toast.error('Could not copy. Select the link and copy it by hand.')
  }
}

const ROLE_LABEL = { owner: 'Owner', staff: 'Staff' } as const

export function TeamPage() {
  const { readOnly } = useBusiness()
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Team" />
      {readOnly ? null : <InviteForm />}
      <PendingInvites />
      <Members />
    </div>
  )
}

function InviteLinkBox({ invite }: { invite: Invite }) {
  const link = inviteLink(invite.token)
  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        aria-label={`Invite link for ${invite.email}`}
        value={link}
        onFocus={(e) => e.target.select()}
        className="h-11 min-w-0 flex-1 rounded-lg border bg-muted px-3 text-sm"
        data-testid="invite-link"
      />
      <Button variant="outline" className="h-11 shrink-0 bg-card px-3.5 text-[0.95rem]" onClick={() => void copy(link, 'Invite link')}>
        <Copy aria-hidden />
        Copy link
      </Button>
    </div>
  )
}

function InviteForm() {
  const { current } = useBusiness()
  const create = useCreateInvite(current.businessId)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'owner' | 'staff'>('staff')
  const [created, setCreated] = useState<Invite | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    create.mutate(
      { email, role },
      {
        onSuccess: (invite) => {
          setCreated(invite)
          setEmail('')
        },
      },
    )
  }

  return (
    <section aria-labelledby="invite-heading" className="mb-8 rounded-2xl border bg-card p-4">
      <h2 id="invite-heading" className="text-lg font-semibold">
        Invite someone
      </h2>
      <p className="mt-0.5 text-[0.95rem] text-muted-foreground">
        Create a link and send it to them yourself. It works for 7 days and only with this email address.
      </p>
      <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end" noValidate>
        <Field label="Email" type="email" inputMode="email" autoComplete="off" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <SelectField label="Role" value={role} onChange={(e) => setRole(e.target.value as 'owner' | 'staff')}>
          <option value="staff">Staff</option>
          <option value="owner">Owner</option>
        </SelectField>
        <Button type="submit" size="touch" disabled={create.isPending || !/^\S+@\S+\.\S+$/.test(email.trim())}>
          <MailPlus aria-hidden />
          {create.isPending ? 'Creating…' : 'Create invite'}
        </Button>
      </form>
      <p className="mt-2 text-sm text-muted-foreground">
        Staff approve, decline and add bookings. Owners also manage tours, seats, team and settings.
      </p>
      {create.isError ? (
        <Notice tone="error" className="mt-3">
          {errorText(create.error)}
        </Notice>
      ) : null}
      {created ? (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-ok/30 bg-ok-soft p-3" role="status">
          <p className="font-medium">
            Invite ready for {created.email}. Send them this link:
          </p>
          <InviteLinkBox invite={created} />
        </div>
      ) : null}
    </section>
  )
}

function PendingInvites() {
  const { current, readOnly } = useBusiness()
  const invites = useInvites(current.businessId)
  const revoke = useRevokeInvite(current.businessId)
  if (!invites.data || invites.data.length === 0) return null
  const now = Date.now()

  return (
    <section aria-labelledby="pending-invites" className="mb-8">
      <h2 id="pending-invites" className="mb-3 text-lg font-semibold">
        Invites not accepted yet
      </h2>
      <ul className="flex flex-col gap-2" data-testid="invite-list">
        {invites.data.map((invite) => {
          const expired = new Date(invite.expires_at).getTime() <= now
          return (
            <li key={invite.id} className="flex flex-col gap-2 rounded-xl border bg-card p-3.5" data-email={invite.email}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0">
                  <span className="font-medium break-all">{invite.email}</span>{' '}
                  <span className="text-muted-foreground">as {ROLE_LABEL[invite.role].toLowerCase()}</span>
                  {expired ? <span className="ml-2 rounded-full bg-bad-soft px-2 py-0.5 text-xs font-semibold text-bad">Expired</span> : null}
                </p>
                <Button
                  variant="ghost"
                  hidden={readOnly}
                  className="h-11 px-3 text-[0.95rem] text-bad hover:bg-bad-soft hover:text-bad"
                  disabled={revoke.isPending}
                  onClick={() =>
                    revoke.mutate(invite.id, {
                      onSuccess: () => toast.success(`Invite for ${invite.email} revoked`),
                      onError: (error) => toast.error(errorText(error)),
                    })
                  }
                >
                  Revoke
                </Button>
              </div>
              {expired || readOnly ? null : <InviteLinkBox invite={invite} />}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Members() {
  const { current, readOnly } = useBusiness()
  const { session } = useAuth()
  const team = useTeam(current.businessId)
  const remove = useRemoveMember(current.businessId)
  const [confirming, setConfirming] = useState<string | null>(null)
  const owners = team.data?.filter((m) => m.role === 'owner').length ?? 0

  return (
    <section aria-labelledby="members-heading">
      <h2 id="members-heading" className="mb-3 text-lg font-semibold">
        Members
      </h2>
      {team.isPending ? (
        <div className="flex flex-col gap-2" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border bg-card" />
          ))}
        </div>
      ) : team.isError ? (
        <Notice tone="error" title="Could not load the team">
          {errorText(team.error)}
        </Notice>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="member-list">
          {team.data.map((member) => {
            const isLastOwner = member.role === 'owner' && owners <= 1
            const isSelf = member.user_id === session?.user.id
            return (
              <li key={member.membership_id} className="rounded-xl border bg-card p-3.5" data-email={member.email}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {member.full_name || member.email}
                      {isSelf ? <span className="text-muted-foreground"> (you)</span> : null}
                    </p>
                    <p className="text-[0.95rem] break-all text-muted-foreground">
                      {member.email}, {ROLE_LABEL[member.role]}
                    </p>
                  </div>
                  {readOnly ? null : isLastOwner ? (
                    <span className="text-sm text-muted-foreground">Only owner, cannot be removed</span>
                  ) : confirming === member.membership_id ? (
                    <span className="flex gap-2">
                      <Button
                        variant="destructive"
                        className="h-11 px-3.5 text-[0.95rem]"
                        disabled={remove.isPending}
                        onClick={() =>
                          remove.mutate(member.membership_id, {
                            onSuccess: () => toast.success(`${member.email} removed`),
                            onError: (error) => toast.error(errorText(error)),
                            onSettled: () => setConfirming(null),
                          })
                        }
                      >
                        Yes, remove
                      </Button>
                      <Button variant="ghost" className="h-11 px-3 text-[0.95rem]" onClick={() => setConfirming(null)}>
                        Keep
                      </Button>
                    </span>
                  ) : (
                    <Button variant="ghost" className="h-11 px-3 text-[0.95rem]" onClick={() => setConfirming(member.membership_id)}>
                      Remove
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
