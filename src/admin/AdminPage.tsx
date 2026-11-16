import { Building2, Copy, Download, Eye, LogOut, MailPlus, Pencil, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { EmptyState, SelectField } from '@/components/app/controls'
import { Field } from '@/components/app/Field'
import { Notice } from '@/components/app/Notice'
import { Sheet } from '@/components/app/Sheet'
import { Button, buttonVariants } from '@/components/ui/button'
import { inviteLink } from '@/dashboard/api'
import { downloadCsv, toCsv } from '@/lib/csv'
import { addMonths, formatMonth, monthOf, todayIn } from '@/lib/dates'
import { errorText } from '@/lib/errors'
import { formatMoney, isAutomationPaused } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  slugify,
  useBillingHistory,
  useCommissionReport,
  useCreateBusiness,
  useInviteOwner,
  useUpdateBilling,
  type BusinessStatus,
  type CommissionRow,
  type CommissionType,
} from './api'

const STATUS_LABEL: Record<BusinessStatus, string> = { trial: 'Trial', active: 'Active', suspended: 'Suspended' }
const STATUS_STYLE: Record<BusinessStatus, string> = {
  trial: 'bg-warn-soft text-warn',
  active: 'bg-ok-soft text-ok',
  suspended: 'bg-bad-soft text-bad',
}
const ADMIN_TIMEZONE = 'Asia/Dubai'

function commissionTerms(row: Pick<CommissionRow, 'commission_type' | 'commission_value' | 'currency'>): string {
  return row.commission_type === 'percent'
    ? `${Number(row.commission_value)}%`
    : `${formatMoney(Number(row.commission_value), row.currency)} per booking`
}

function trialDate(value: string | null, timezone = ADMIN_TIMEZONE): string {
  if (!value) return 'No end date'
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: timezone }).format(new Date(value))
}

export function AdminPage() {
  const { session, signOut } = useAuth()
  const thisMonth = monthOf(todayIn(ADMIN_TIMEZONE))
  const [month, setMonth] = useState(thisMonth)
  const report = useCommissionReport(month)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<CommissionRow | null>(null)
  const [inviting, setInviting] = useState<{ id: string; name: string } | null>(null)

  const totals = new Map<string, number>()
  for (const row of report.data ?? []) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + Number(row.commission_owed))
  }

  function exportCsv() {
    downloadCsv(
      `commission-${month}.csv`,
      toCsv(
        ['Business', 'Status', 'Trial ends', 'Month', 'Approved WhatsApp bot', 'Approved Instagram bot', 'Approved manual', 'Approved total', 'Bot revenue', 'Commission terms', 'Commission owed', 'Currency'],
        (report.data ?? []).map((r) => [
          r.business_name, STATUS_LABEL[r.status], r.trial_ends_at ? r.trial_ends_at.slice(0, 10) : '', month,
          r.approved_whatsapp, r.approved_instagram, r.approved_manual, r.approved_total, Number(r.bot_revenue),
          commissionTerms(r), Number(r.commission_owed), r.currency,
        ]),
      ),
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-16 md:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.65rem] leading-tight font-semibold">Platform admin</h1>
          <p className="mt-0.5 break-all text-muted-foreground">{session?.user.email}</p>
        </div>
        <div className="flex gap-2">
          <Button size="touch" onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            Create business
          </Button>
          <Button variant="outline" size="icon-touch" className="bg-card" aria-label="Sign out" onClick={() => void signOut()}>
            <LogOut aria-hidden />
          </Button>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="w-44">
          <Field
            label="Month"
            type="month"
            value={month}
            max={addMonths(thisMonth, 12)}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
          />
        </div>
        <Button variant="outline" size="touch" className="bg-card" disabled={month === thisMonth} onClick={() => setMonth(thisMonth)}>
          This month
        </Button>
        <Button variant="outline" size="touch" className="bg-card" disabled={!report.data || report.data.length === 0} onClick={exportCsv}>
          <Download aria-hidden />
          Commission CSV
        </Button>
      </div>

      <section aria-labelledby="businesses-heading" className="mt-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="businesses-heading" className="text-lg font-semibold">
            Businesses, {formatMonth(month)}
          </h2>
          {totals.size > 0 ? (
            <p className="text-muted-foreground" data-testid="commission-total">
              Commission owed:{' '}
              <strong className="font-heading text-foreground tabular">
                {[...totals].map(([currency, amount]) => formatMoney(amount, currency)).join(' + ')}
              </strong>
            </p>
          ) : null}
        </div>

        {report.isPending ? (
          <div className="flex flex-col gap-2" aria-hidden>
            {[0, 1].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl border bg-card" />
            ))}
          </div>
        ) : report.isError ? (
          <Notice tone="error" title="Could not load businesses">
            {errorText(report.error)}
          </Notice>
        ) : report.data.length === 0 ? (
          <EmptyState icon={<Building2 />} title="No businesses yet" action={<Button size="touch" onClick={() => setCreating(true)}>Create the first business</Button>}>
            Create a business, then invite its owner.
          </EmptyState>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card">
            <table className="w-full text-left" data-testid="business-table">
              <thead className="hidden border-b bg-muted/60 text-sm text-muted-foreground lg:table-header-group">
                <tr>
                  <th className="px-4 py-3 font-medium">Business</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Trial ends</th>
                  <th className="px-3 py-3 text-right font-medium">WhatsApp</th>
                  <th className="px-3 py-3 text-right font-medium">Instagram</th>
                  <th className="px-3 py-3 text-right font-medium">Manual</th>
                  <th className="px-3 py-3 text-right font-medium">Commission owed</th>
                  <th className="px-4 py-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.data.map((row) => {
                  const paused = isAutomationPaused(row.status, row.trial_ends_at)
                  return (
                    <tr key={row.business_id} className="flex flex-col gap-2 p-4 lg:table-row lg:p-0" data-business={row.business_name}>
                      <td className="lg:px-4 lg:py-3">
                        <p className="font-heading text-lg leading-snug font-semibold lg:text-base">{row.business_name}</p>
                        <p className="text-sm text-muted-foreground">Commission {commissionTerms(row)}</p>
                      </td>
                      <td className="lg:px-3 lg:py-3">
                        <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold', STATUS_STYLE[row.status])}>
                          {STATUS_LABEL[row.status]}
                        </span>
                        {paused && row.status === 'trial' ? <span className="ml-2 text-sm font-medium text-bad">Trial ended</span> : null}
                      </td>
                      <td className="lg:px-3 lg:py-3">
                        <span className="text-muted-foreground lg:hidden">Trial ends: </span>
                        {trialDate(row.trial_ends_at)}
                      </td>
                      <td className="tabular lg:px-3 lg:py-3 lg:text-right">
                        <span className="text-muted-foreground lg:hidden">Approved via WhatsApp bot: </span>
                        <span data-testid="approved-whatsapp">{row.approved_whatsapp}</span>
                      </td>
                      <td className="tabular lg:px-3 lg:py-3 lg:text-right">
                        <span className="text-muted-foreground lg:hidden">Approved via Instagram bot: </span>
                        <span data-testid="approved-instagram">{row.approved_instagram}</span>
                      </td>
                      <td className="tabular lg:px-3 lg:py-3 lg:text-right">
                        <span className="text-muted-foreground lg:hidden">Approved manual: </span>
                        <span data-testid="approved-manual">{row.approved_manual}</span>
                      </td>
                      <td className="lg:px-3 lg:py-3 lg:text-right">
                        <span className="text-muted-foreground lg:hidden">Commission owed: </span>
                        <strong className="font-heading tabular" data-testid="commission-owed">
                          {formatMoney(Number(row.commission_owed), row.currency)}
                        </strong>
                      </td>
                      <td className="lg:px-4 lg:py-3">
                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <Link
                            to={`/admin/view/${row.business_id}/bookings`}
                            className={cn(buttonVariants({ variant: 'outline' }), 'h-11 bg-card px-3.5 text-[0.95rem]')}
                          >
                            <Eye aria-hidden />
                            View as
                          </Link>
                          <Button variant="outline" className="h-11 bg-card px-3.5 text-[0.95rem]" onClick={() => setEditing(row)}>
                            <Pencil aria-hidden />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            className="h-11 bg-card px-3.5 text-[0.95rem]"
                            onClick={() => setInviting({ id: row.business_id, name: row.business_name })}
                          >
                            <MailPlus aria-hidden />
                            Invite owner
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          Counts are approved bookings with a tour date in {formatMonth(month)}. Commission is owed on approved chatbot
          bookings only, never on manual ones.
        </p>
      </section>

      <Sheet open={creating} onClose={() => setCreating(false)} title="Create business" description="Starts on a trial. Invite the owner next.">
        {creating ? (
          <CreateBusinessForm
            onCreated={(business) => {
              setCreating(false)
              setInviting(business)
            }}
          />
        ) : null}
      </Sheet>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing ? `Edit ${editing.business_name}` : ''} description="Every change here is written to the audit log.">
        {editing ? <BillingForm key={editing.business_id} row={editing} onDone={() => setEditing(null)} /> : null}
      </Sheet>

      <Sheet
        open={inviting !== null}
        onClose={() => setInviting(null)}
        title={inviting ? `Invite owner of ${inviting.name}` : ''}
        description="Creates a link for you to send. It works for 7 days and only with this email address."
      >
        {inviting ? <InviteOwnerForm key={inviting.id} businessId={inviting.id} /> : null}
      </Sheet>
    </div>
  )
}

function CreateBusinessForm({ onCreated }: { onCreated: (business: { id: string; name: string }) => void }) {
  const create = useCreateBusiness()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState<string | null>(null)
  const [timezone, setTimezone] = useState('Asia/Dubai')
  const [currency, setCurrency] = useState('AED')
  const [trialDays, setTrialDays] = useState('14')
  const finalSlug = slug ?? slugify(name)
  const slugValid = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(finalSlug)

  function submit(event: FormEvent) {
    event.preventDefault()
    create.mutate(
      { name, slug: finalSlug, timezone, currency, trialDays: Number(trialDays) || 0 },
      {
        onSuccess: (business) => {
          toast.success(`${business.name} created`)
          onCreated(business)
        },
      },
    )
  }

  const duplicate = (create.error as { code?: string } | null)?.code === '23505'

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Business name" required value={name} onChange={(e) => setName(e.target.value)} />
      <Field
        label="Short name for links"
        hint="Lowercase letters, numbers and dashes."
        required
        value={finalSlug}
        onChange={(e) => setSlug(e.target.value.toLowerCase())}
        aria-invalid={finalSlug !== '' && !slugValid}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Timezone" required value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        <Field label="Currency" required maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
      </div>
      <Field label="Trial length (days)" type="number" inputMode="numeric" min={0} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} />
      {create.isError ? (
        <Notice tone="error">
          {duplicate ? 'A business with this short name already exists. Choose another.' : errorText(create.error)}
        </Notice>
      ) : null}
      <Button type="submit" size="touch" disabled={create.isPending || !name.trim() || !slugValid || currency.length !== 3}>
        {create.isPending ? 'Creating…' : 'Create business'}
      </Button>
    </form>
  )
}

function InviteOwnerForm({ businessId }: { businessId: string }) {
  const invite = useInviteOwner()
  const [email, setEmail] = useState('')
  const link = invite.data ? inviteLink(invite.data.token) : null

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          invite.mutate({ businessId, email })
        }}
      >
        <Field label="Owner's email" type="email" inputMode="email" autoComplete="off" required value={email} onChange={(e) => setEmail(e.target.value)} />
        {invite.isError ? <Notice tone="error">{errorText(invite.error)}</Notice> : null}
        <Button type="submit" size="touch" disabled={invite.isPending || !/^\S+@\S+\.\S+$/.test(email.trim())}>
          <MailPlus aria-hidden />
          {invite.isPending ? 'Creating…' : 'Create invite link'}
        </Button>
      </form>
      {link && invite.data ? (
        <div className="flex flex-col gap-2 rounded-xl border border-ok/30 bg-ok-soft p-3" role="status">
          <p className="font-medium">Invite ready for {invite.data.email}. Send them this link:</p>
          <input
            readOnly
            aria-label="Invite link"
            value={link}
            onFocus={(e) => e.target.select()}
            className="h-11 w-full rounded-lg border bg-card px-3 text-sm"
            data-testid="owner-invite-link"
          />
          <Button
            variant="outline"
            size="touch"
            className="bg-card"
            onClick={() =>
              navigator.clipboard.writeText(link).then(
                () => toast.success('Invite link copied'),
                () => toast.error('Could not copy. Select the link and copy it by hand.'),
              )
            }
          >
            <Copy aria-hidden />
            Copy link
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function BillingForm({ row, onDone }: { row: CommissionRow; onDone: () => void }) {
  const update = useUpdateBilling(row.business_id)
  const history = useBillingHistory(row.business_id)
  // Businesses run on Dubai time unless set otherwise; the trial ends at the end of that day there.
  const timezone = ADMIN_TIMEZONE
  const [status, setStatus] = useState<BusinessStatus>(row.status)
  const [trialEnd, setTrialEnd] = useState(row.trial_ends_at ? todayIn(timezone, new Date(row.trial_ends_at)) : '')
  const [type, setType] = useState<CommissionType>(row.commission_type)
  const [value, setValue] = useState(String(Number(row.commission_value)))
  const valueNumber = Number(value)
  const valid = value.trim() !== '' && valueNumber >= 0 && (type !== 'percent' || valueNumber <= 100)

  function submit(event: FormEvent) {
    event.preventDefault()
    update.mutate(
      { status, trialEndDate: trialEnd, timezone, commissionType: type, commissionValue: valueNumber },
      {
        onSuccess: () => {
          toast.success(`${row.business_name} updated`)
          onDone()
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value as BusinessStatus)}>
          <option value="trial">Trial</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </SelectField>
        <Field label="Trial end date" type="date" hint="Leave empty for no end date." value={trialEnd} onChange={(e) => setTrialEnd(e.target.value)} />
        <SelectField label="Commission type" value={type} onChange={(e) => setType(e.target.value as CommissionType)}>
          <option value="percent">Percent of booking value</option>
          <option value="fixed_per_booking">Fixed amount per booking</option>
        </SelectField>
        <Field
          label={type === 'percent' ? 'Commission (%)' : `Commission per booking (${row.currency})`}
          type="number"
          inputMode="decimal"
          min={0}
          max={type === 'percent' ? 100 : undefined}
          step="0.01"
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {status === 'suspended' ? (
          <Notice tone="warning">Chatbot bookings stop while suspended. The owner keeps full access to the dashboard and exports.</Notice>
        ) : null}
        {update.isError ? <Notice tone="error">{errorText(update.error)}</Notice> : null}
        <Button type="submit" size="touch" disabled={update.isPending || !valid}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </form>

      <section aria-labelledby="history-heading">
        <h3 id="history-heading" className="mb-2 text-base font-semibold">
          Recent changes
        </h3>
        {history.isPending ? (
          <div className="h-16 animate-pulse rounded-xl bg-muted" aria-hidden />
        ) : history.isError ? (
          <Notice tone="error">{errorText(history.error)}</Notice>
        ) : history.data.length === 0 ? (
          <p className="text-muted-foreground">No changes recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-[0.95rem]" data-testid="audit-list">
            {history.data.map((entry) => (
              <li key={entry.id} className="rounded-lg bg-muted px-3 py-2">
                <p className="text-sm text-muted-foreground">
                  {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(entry.created_at))}
                </p>
                <p>{describeChange(entry.action, entry.details)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

const FIELD_LABEL: Record<string, string> = {
  status: 'Status',
  trial_ends_at: 'Trial end',
  commission_type: 'Commission type',
  commission_value: 'Commission',
}

function describeChange(action: string, details: unknown): string {
  if (action === 'business.created') return 'Business created'
  if (!details || typeof details !== 'object') return action
  const show = (v: unknown) => (v === null ? 'none' : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? trialDate(v) : String(v).replace(/_/g, ' '))
  return Object.entries(details as Record<string, unknown>)
    .map(([field, change]) => {
      const [from, to] = Array.isArray(change) ? change : [undefined, change]
      return `${FIELD_LABEL[field] ?? field}: ${show(from)} to ${show(to)}`
    })
    .join('. ')
}
