import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { PageHeader, SelectField } from '@/components/app/controls'
import { Field } from '@/components/app/Field'
import { Notice } from '@/components/app/Notice'
import { Button } from '@/components/ui/button'
import { errorText } from '@/lib/errors'
import { useBusinessDetails, useUpdateBusiness, type Business } from './api'
import { useBusiness } from './BusinessProvider'

const COMMON_TIMEZONES = [
  'Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Kuwait', 'Asia/Bahrain', 'Asia/Muscat',
  'Africa/Cairo', 'Europe/Istanbul', 'Europe/London', 'Asia/Kolkata', 'UTC',
]

const STATUS_LABEL = { trial: 'Trial', active: 'Active', suspended: 'Suspended' } as const

export function SettingsPage() {
  const { current } = useBusiness()
  const details = useBusinessDetails(current.businessId)

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" />
      {details.isPending ? (
        <div className="h-80 animate-pulse rounded-2xl border bg-card" aria-hidden />
      ) : details.isError ? (
        <Notice tone="error" title="Could not load settings">
          {errorText(details.error)}
        </Notice>
      ) : (
        <>
          <SettingsForm key={details.data.id} business={details.data} />
          <Plan business={details.data} />
        </>
      )}
    </div>
  )
}

function SettingsForm({ business }: { business: Business }) {
  const update = useUpdateBusiness(business.id)
  const [name, setName] = useState(business.name)
  const [timezone, setTimezone] = useState(business.timezone)
  const [whatsapp, setWhatsapp] = useState(business.whatsapp_phone ?? '')
  const [instagram, setInstagram] = useState(business.instagram_handle ?? '')
  const zones = COMMON_TIMEZONES.includes(business.timezone) ? COMMON_TIMEZONES : [business.timezone, ...COMMON_TIMEZONES]

  function submit(event: FormEvent) {
    event.preventDefault()
    update.mutate(
      {
        name: name.trim(),
        timezone,
        whatsapp_phone: whatsapp.trim() || null,
        instagram_handle: instagram.trim().replace(/^@/, '') || null,
      },
      { onSuccess: () => toast.success('Settings saved') },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border bg-card p-4" noValidate>
      <Field label="Business name" required value={name} onChange={(e) => setName(e.target.value)} />
      <SelectField label="Timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
        {zones.map((z) => (
          <option key={z} value={z}>
            {z.replace('_', ' ')}
          </option>
        ))}
      </SelectField>
      <p className="-mt-2 text-sm text-muted-foreground">Decides what counts as “today” for bookings and the calendar.</p>
      <Field label="WhatsApp number" type="tel" inputMode="tel" placeholder="+971 50 123 4567" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
      <Field label="Instagram handle" placeholder="yourbusiness" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
      {update.isError ? <Notice tone="error">{errorText(update.error)}</Notice> : null}
      <Button type="submit" size="touch" disabled={update.isPending || !name.trim()}>
        {update.isPending ? 'Saving…' : 'Save settings'}
      </Button>
    </form>
  )
}

function Plan({ business }: { business: Business }) {
  const commission =
    business.commission_type === 'percent'
      ? `${Number(business.commission_value)}% of each approved chatbot booking`
      : `${business.currency} ${Number(business.commission_value)} per approved chatbot booking`
  const rows = [
    ['Status', STATUS_LABEL[business.status]],
    [
      'Trial ends',
      business.trial_ends_at
        ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: business.timezone }).format(new Date(business.trial_ends_at))
        : 'No end date',
    ],
    ['Commission', commission],
    ['Currency', business.currency],
  ] as const

  return (
    <section aria-labelledby="plan-heading" className="mt-6 rounded-2xl border bg-muted/50 p-4">
      <h2 id="plan-heading" className="text-lg font-semibold">
        Your plan
      </h2>
      <p className="mt-0.5 text-[0.95rem] text-muted-foreground">Set by your provider. Contact them to change it.</p>
      <dl className="mt-3 flex flex-col divide-y" data-testid="plan">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 py-2.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
