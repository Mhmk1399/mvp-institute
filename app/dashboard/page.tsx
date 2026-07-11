import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DashboardSWRProvider } from "@/components/providers/dashboard-swr-provider";
import { requireUser } from "@/lib/auth/guards";
import {
  loadDashboardTabData,
  parseDashboardTabForRole,
} from "@/lib/dashboard/data";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const activeTab = parseDashboardTabForRole(user.role, params.tab);

  if (params.tab !== undefined && activeTab !== (Array.isArray(params.tab) ? params.tab[0] : params.tab)) {
    redirect(`/dashboard?tab=${activeTab}`);
  }

  const data = await loadDashboardTabData(user.role, user.id, activeTab);
  return (
    <DashboardSWRProvider initialTab={activeTab} initialData={data}>
      <DashboardShell user={user} initialTab={activeTab} initialData={data} />
    </DashboardSWRProvider>
  );
}
