import { NextResponse } from "next/server";
import { generateKey, LICENSE_DURATIONS, type LicenseType } from "@/lib/license";

export const runtime = "edge";

export async function POST(req: Request) {
  // ── Auth ────────────────────────────────────────────────────────────
  const adminPassword = process.env.ADMIN_PASSWORD;
  const licenseSecret = process.env.LICENSE_SECRET;

  if (!adminPassword || !licenseSecret) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const authHeader = req.headers.get("x-admin-password");
  if (!authHeader || authHeader !== adminPassword) {
    // Rate limiting hint: Vercel Edge doesn't have built-in rate limiting,
    // but wrong password attempts are cheap to check.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ──────────────────────────────────────────────────────
  const { type, count = 1 } = await req.json() as {
    type?: LicenseType;
    count?: number;
  };

  if (!type || !["M", "Y", "L"].includes(type)) {
    return NextResponse.json({ error: "Invalid type. Use M, Y, or L" }, { status: 400 });
  }

  const safeCount = Math.min(Math.max(1, count), 50); // max 50 at once
  const duration  = LICENSE_DURATIONS[type];

  const keys = await Promise.all(
    Array.from({ length: safeCount }, () => generateKey(licenseSecret, type, duration))
  );

  return NextResponse.json({ keys });
}