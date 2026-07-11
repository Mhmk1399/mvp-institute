"use client";

import Link from "next/link";

import { signOutAction } from "@/actions/auth";
import type { CurrentUser } from "@/lib/auth/session";

export function DashboardHeader({
  user,
  title,
  onMenu,
}: {
  user: CurrentUser;
  title: string;
  onMenu: () => void;
}) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-4 md:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          aria-label="Open dashboard menu"
          onClick={onMenu}
          className="rounded-xl border border-white/12 px-3 py-2 text-sm text-[#F3F8FF] outline-none focus-visible:ring-2 focus-visible:ring-[#57D7FF]/70 md:hidden"
        >
          Menu
        </button>
        <div className="hidden shrink-0 md:block">
          <p className="text-base font-semibold tracking-tight text-[#F3F8FF]">newinstitute</p>
        </div>
        <Link
          href="/"
          className="hidden rounded-xl border border-white/12 px-3 py-2 text-sm font-medium text-[#F3F8FF] outline-none transition hover:bg-white/6 focus-visible:ring-2 focus-visible:ring-[#57D7FF]/70 md:inline-flex"
        >
          Home
        </Link>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-[#91A4B7]">Dashboard</p>
          <h1 className="truncate text-xl font-semibold tracking-tight text-[#F3F8FF]">{title}</h1>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-[#F3F8FF]">{user.name}</p>
          <p className="text-xs text-[#91A4B7]">{user.email}</p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-xl border border-white/12 px-3 py-2 text-sm font-medium text-[#F3F8FF] outline-none transition hover:bg-white/6 focus-visible:ring-2 focus-visible:ring-[#57D7FF]/70"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
