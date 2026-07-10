"use client";

import type { ReviewRowDTO } from "@/lib/services/dashboard";

export function ReviewTable({ rows, onOpen }: { rows: ReviewRowDTO[]; onOpen: (row: ReviewRowDTO) => void }) {
  if (!rows.length) {
    return <p className="rounded-3xl border border-white/10 bg-[#0D1B2A]/78 p-6 text-sm text-[#91A4B7]">No review rows yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-3xl border border-white/10 bg-[#0D1B2A]/78">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-white/10 text-xs uppercase tracking-[0.16em] text-[#91A4B7]">
          <tr>
            <th className="px-4 py-3">Student</th>
            <th className="px-4 py-3">Level</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Score</th>
            <th className="px-4 py-3">Updated</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-white/8 last:border-0">
              <td className="px-4 py-3">
                <p className="font-medium">{row.studentName}</p>
                <p className="text-xs text-[#91A4B7]">{row.studentEmail}</p>
              </td>
              <td className="px-4 py-3">{row.level ?? "n/a"}</td>
              <td className="px-4 py-3">
                <span className={row.needsReview ? "text-[#FFC66D]" : "text-[#55E6B1]"}>{row.status}</span>
              </td>
              <td className="px-4 py-3">{typeof row.score === "number" ? `${Math.round(row.score * 100)}%` : "n/a"}</td>
              <td className="px-4 py-3 text-[#91A4B7]">{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : ""}</td>
              <td className="px-4 py-3 text-right">
                <button type="button" onClick={() => onOpen(row)} className="rounded-xl border border-white/12 px-3 py-2 text-xs font-medium outline-none hover:bg-white/6 focus-visible:ring-2 focus-visible:ring-[#57D7FF]/70">
                  Review
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
