import "server-only";

import { SESSION_COOKIE } from "@/lib/auth/constants";
import { verifyJwt } from "@/lib/auth/crypto";
import { connectToDatabase } from "@/lib/db/mongoose";
import { env } from "@/lib/env";
import { User } from "@/lib/models/user";

function readCookie(cookieHeader: string, name: string): string | null {
  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 1) continue;
    if (item.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(item.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export async function authenticateRealtimeRequest(cookieHeader?: string) {
  if (!cookieHeader) return null;
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (!token) return null;
  const payload = verifyJwt(token, env.authSecret);
  if (!payload) return null;

  try {
    await connectToDatabase();
    const user = await User.findById(payload.sub).lean();
    if (!user) return null;
    return {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
    };
  } catch {
    return null;
  }
}
