"use client";

import { useState, type ReactNode } from "react";
import { SWRConfig } from "swr";

import { dashboardCacheKey } from "@/lib/client/dashboard-cache";
import type { DashboardPageData } from "@/lib/dashboard/data";
import type { DashboardTab } from "@/lib/schemas/dashboard";

export function DashboardSWRProvider({
  initialTab,
  initialData,
  children,
}: {
  initialTab: DashboardTab;
  initialData: DashboardPageData;
  children: ReactNode;
}) {
  const [cache] = useState(() => new Map());

  return (
    <SWRConfig
      value={{
        provider: () => cache,
        fallback: {
          [dashboardCacheKey(initialTab)]: { tab: initialTab, data: initialData },
        },
        dedupingInterval: 30_000,
        focusThrottleInterval: 60_000,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        errorRetryCount: 2,
        shouldRetryOnError: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
