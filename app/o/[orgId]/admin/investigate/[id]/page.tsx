import { redirect } from "next/navigation";

type PageParams = {
  params: {
    orgId: string;
    id: string;
  };
};

export default function AdminInvestigateRedirect({ params }: PageParams) {
  const encodedId = encodeURIComponent(params.id);
  redirect(`/investigate/${encodedId}`);
}
