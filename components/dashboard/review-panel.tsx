"use client";

import { useState } from "react";

import { ReviewDrawer } from "@/components/dashboard/review-drawer";
import { ReviewTable } from "@/components/dashboard/review-table";
import type { ReviewRowDTO } from "@/lib/services/dashboard";

export function ReviewPanel({ title, rows }: { title: string; rows: ReviewRowDTO[] }) {
  const [selected, setSelected] = useState<ReviewRowDTO | null>(null);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-[#91A4B7]">Read-only review queue. Feedback saving is disabled until persistence exists.</p>
      </div>
      <ReviewTable rows={rows} onOpen={setSelected} />
      <ReviewDrawer row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
