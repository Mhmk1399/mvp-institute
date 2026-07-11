"use client";

import type { ReviewRowDTO } from "@/lib/services/dashboard";

function dash(value: string | number | undefined): string | number {
  return value === undefined || value === "" ? "—" : value;
}

function percent(value: number | undefined): string {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "—";
}

export function ReviewTable({
  rows,
  onOpen,
}: {
  rows: ReviewRowDTO[];
  onOpen: (row: ReviewRowDTO, trigger: HTMLButtonElement) => void;
}) {
  if (!rows.length) {
    return <p className="rounded-3xl border border-white/10 bg-[#0D1B2A]/78 p-6 text-sm text-[#91A4B7]">No review rows yet.</p>;
  }

  const type = rows[0]?.type ?? "exam";

  return (
    <div className="overflow-x-auto rounded-3xl border border-white/10 bg-[#0D1B2A]/78">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="border-b border-white/10 text-xs uppercase tracking-[0.16em] text-[#91A4B7]">
          {type === "exam" ? <ExamHead /> : <ClassHead />}
        </thead>
        <tbody>
          {rows.map((row) =>
            row.type === "exam" ? (
              <ExamRow key={row.id} row={row} onOpen={onOpen} />
            ) : (
              <ClassRow key={row.id} row={row} onOpen={onOpen} />
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function StudentCell({ row, context }: { row: ReviewRowDTO; context: string }) {
  return (
    <td className="px-4 py-3">
      <p className="max-w-56 whitespace-normal font-medium">{row.studentName}</p>
      <p className="text-xs text-[#91A4B7]">{row.studentEmail}</p>
      <p className="mt-1 max-w-64 whitespace-normal text-xs text-[#91A4B7] md:hidden">{context}</p>
    </td>
  );
}

function ReviewButton({
  row,
  onOpen,
}: {
  row: ReviewRowDTO;
  onOpen: (row: ReviewRowDTO, trigger: HTMLButtonElement) => void;
}) {
  return (
    <td className="sticky right-0 bg-[#0D1B2A] px-4 py-3 text-right">
      <button
        type="button"
        onClick={(event) => onOpen(row, event.currentTarget)}
        className="rounded-xl border border-white/12 px-3 py-2 text-xs font-medium outline-none hover:bg-white/6 focus-visible:ring-2 focus-visible:ring-[#57D7FF]/70"
      >
        Review
      </button>
    </td>
  );
}

function statusClass(row: ReviewRowDTO) {
  if (row.needsReview || (typeof row.confidence === "number" && row.confidence < 0.6)) {
    return "text-[#FFC66D]";
  }
  return "text-[#55E6B1]";
}

function ExamHead() {
  return (
    <tr>
      <th className="px-4 py-3">Student</th>
      <th className="px-4 py-3">Level</th>
      <th className="px-4 py-3">Status</th>
      <th className="px-4 py-3">Score</th>
      <th className="px-4 py-3">Confidence</th>
      <th className="px-4 py-3">Updated</th>
      <th className="px-4 py-3">Review</th>
    </tr>
  );
}

function ClassHead() {
  return (
    <tr>
      <th className="px-4 py-3">Student</th>
      <th className="px-4 py-3">Subject</th>
      <th className="px-4 py-3">Level</th>
      <th className="px-4 py-3">Status</th>
      <th className="px-4 py-3">Corrections</th>
      <th className="px-4 py-3">Taught items</th>
      <th className="px-4 py-3">Updated</th>
      <th className="px-4 py-3">Review</th>
    </tr>
  );
}

function ExamRow({
  row,
  onOpen,
}: {
  row: ReviewRowDTO;
  onOpen: (row: ReviewRowDTO, trigger: HTMLButtonElement) => void;
}) {
  return (
    <tr className={`border-b border-white/8 last:border-0 ${row.needsReview ? "bg-[#FFC66D]/5" : ""}`}>
      <StudentCell row={row} context={row.title} />
      <td className="px-4 py-3">{dash(row.level)}</td>
      <td className="px-4 py-3">
        <span className={statusClass(row)}>{row.status}</span>
      </td>
      <td className="px-4 py-3">{percent(row.score)}</td>
      <td className={`px-4 py-3 ${typeof row.confidence === "number" && row.confidence < 0.6 ? "text-[#FFC66D]" : ""}`}>
        {percent(row.confidence)}
      </td>
      <td className="px-4 py-3 text-[#91A4B7]">{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—"}</td>
      <ReviewButton row={row} onOpen={onOpen} />
    </tr>
  );
}

function ClassRow({
  row,
  onOpen,
}: {
  row: ReviewRowDTO;
  onOpen: (row: ReviewRowDTO, trigger: HTMLButtonElement) => void;
}) {
  return (
    <tr className={`border-b border-white/8 last:border-0 ${row.needsReview ? "bg-[#FFC66D]/5" : ""}`}>
      <StudentCell row={row} context={row.title} />
      <td className="px-4 py-3">{dash(row.title)}</td>
      <td className="px-4 py-3">{dash(row.level)}</td>
      <td className="px-4 py-3">
        <span className={statusClass(row)}>{row.status}</span>
      </td>
      <td className="px-4 py-3">{row.correctionCount ?? row.detail.corrections.length}</td>
      <td className="px-4 py-3">{row.taughtItemCount ?? row.detail.evidence.length}</td>
      <td className="px-4 py-3 text-[#91A4B7]">{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—"}</td>
      <ReviewButton row={row} onOpen={onOpen} />
    </tr>
  );
}
