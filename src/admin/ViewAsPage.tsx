import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { MembershipWithBusiness } from '@/auth/useAccess'
import { FullPageSpinner } from '@/components/app/FullPageSpinner'
import { Notice } from '@/components/app/Notice'
import { ViewAsBusinessProvider } from '@/dashboard/BusinessProvider'
import { DashboardLayout } from '@/dashboard/DashboardLayout'
import { errorText } from '@/lib/errors'
import { useBusinessForView } from './api'

/** The owner's dashboard for any business, read-only, for the platform admin. */
export function ViewAsPage() {
  const { businessId = '' } = useParams()
  const business = useBusinessForView(businessId)

  const membership = useMemo<MembershipWithBusiness | null>(
    () =>
      business.data
        ? {
            businessId: business.data.id,
            businessName: business.data.name,
            role: 'owner',
            status: business.data.status,
            trialEndsAt: business.data.trial_ends_at,
            timezone: business.data.timezone,
            currency: business.data.currency,
          }
        : null,
    [business.data],
  )

  if (business.isPending) return <FullPageSpinner />
  if (business.isError || !membership) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-5">
        <Notice tone="error" title="Business not found">
          {business.isError ? errorText(business.error) : 'It may have been deleted.'}
        </Notice>
        <Link to="/admin" className="font-semibold text-primary underline-offset-4 hover:underline">
          Back to admin
        </Link>
      </div>
    )
  }
  return (
    <ViewAsBusinessProvider business={membership}>
      <DashboardLayout />
    </ViewAsBusinessProvider>
  )
}
