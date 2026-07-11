import { getCurrentUser } from "@/lib/auth/session";
import { loadDashboardTabData, parseDashboardTabForRole } from "@/lib/dashboard/data";
import { dashboardTabSchema } from "@/lib/schemas/dashboard";

const headers = {
  "Cache-Control": "private, no-store",
  "Content-Type": "application/json",
};

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers });

  const rawTab = new URL(request.url).searchParams.get("tab");
  const parsed = dashboardTabSchema.safeParse(rawTab);
  if (!parsed.success || parseDashboardTabForRole(user.role, parsed.data) !== parsed.data) {
    return Response.json({ error: "Forbidden" }, { status: 403, headers });
  }

  try {
    const data = await loadDashboardTabData(user.role, user.id, parsed.data);
    return Response.json({ tab: parsed.data, data }, { headers });
  } catch {
    return Response.json({ error: "Unable to load dashboard data" }, { status: 500, headers });
  }
}
