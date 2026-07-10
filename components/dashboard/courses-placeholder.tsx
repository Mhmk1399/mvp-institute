"use client";

export function CoursesPlaceholder() {
  return (
    <section className="rounded-3xl border border-dashed border-white/18 bg-[#0D1B2A]/72 p-8">
      <p className="text-xs uppercase tracking-[0.18em] text-[#FFC66D]">Coming next</p>
      <h2 className="mt-3 text-xl font-semibold">Courses</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#91A4B7]">
        Course planning and enrollment will live here after the course model exists.
      </p>
      <button
        type="button"
        disabled
        className="mt-6 cursor-not-allowed rounded-2xl border border-white/12 px-4 py-2 text-sm text-[#91A4B7]"
      >
        Course management disabled
      </button>
    </section>
  );
}
