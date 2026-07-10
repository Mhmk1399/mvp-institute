"use client";

import type { UserRowDTO } from "@/lib/services/dashboard";

export function UsersPanel({ users }: { users: UserRowDTO[] }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Users</h2>
        <p className="mt-1 text-sm text-[#91A4B7]">Read-only account list. Password hashes are never loaded.</p>
      </div>
      <div className="overflow-x-auto rounded-3xl border border-white/10 bg-[#0D1B2A]/78">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-[0.16em] text-[#91A4B7]">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Placement</th>
              <th className="px-4 py-3">Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-white/8 last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium">{user.name}</p>
                  <p className="text-xs text-[#91A4B7]">{user.email}</p>
                </td>
                <td className="px-4 py-3">{user.role}</td>
                <td className="px-4 py-3">{user.status}</td>
                <td className="px-4 py-3">{user.cefrLevel ?? user.placementStatus}</td>
                <td className="px-4 py-3 text-[#91A4B7]">{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
