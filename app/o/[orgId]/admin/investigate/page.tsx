import { redirect } from "next/navigation"

export default function InvestigateIndex({
  params,
}: {
  params: { orgId: string }
}) {
  redirect(`/o/${params.orgId}/admin/assignments`)
}
