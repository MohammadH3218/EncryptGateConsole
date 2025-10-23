import { redirect } from "next/navigation"

export default function CompanySettingsIndex({
  params,
}: {
  params: { orgId: string }
}) {
  redirect(`/o/${params.orgId}/admin/company-settings/cloud-services`)
}
