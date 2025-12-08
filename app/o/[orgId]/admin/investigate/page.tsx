import { redirect } from "next/navigation"

export default async function InvestigateIndex({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  redirect(`/o/${orgId}/admin/assignments`)
}
