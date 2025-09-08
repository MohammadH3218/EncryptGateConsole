'use client'

import { useEffect } from 'react'
import { setOrgContext } from '@/lib/orgContext'

interface OrgContextSyncProps {
  orgId: string
}

export default function OrgContextSync({ orgId }: OrgContextSyncProps) {
  useEffect(() => {
    if (orgId) {
      setOrgContext(orgId)
    }
  }, [orgId])

  return null
}