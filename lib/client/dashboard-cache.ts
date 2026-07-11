"use client";

import useSWR from "swr";

import type { DashboardPageData } from "@/lib/dashboard/data";
import type { DashboardTab } from "@/lib/schemas/dashboard";

interface DashboardResponse {
  tab: DashboardTab;
  data: DashboardPageData;
}

export function dashboardCacheKey(tab: DashboardTab): string {
  return `/api/dashboard?tab=${encodeURIComponent(tab)}`;
}

export async function fetchDashboardData(url: string): Promise<DashboardResponse> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load dashboard data");
  return (await response.json()) as DashboardResponse;
}

export function useDashboardData({
  tab,
  initialTab,
  initialData,
}: {
  tab: DashboardTab;
  initialTab: DashboardTab;
  initialData: DashboardPageData;
}) {
  const result = useSWR<DashboardResponse>(dashboardCacheKey(tab), fetchDashboardData, {
    fallbackData: tab === initialTab ? { tab: initialTab, data: initialData } : undefined,
    revalidateOnMount: tab === initialTab ? false : undefined,
  });

  return {
    data: result.data?.data,
    error: result.error,
    isLoading: result.isLoading,
    isValidating: result.isValidating,
    mutate: result.mutate,
  };
}
