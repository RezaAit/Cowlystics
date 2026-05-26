import { NextResponse } from "next/server";
import { verifyKey } from "@/lib/license";

export const runtime = "edge"; // fast, runs on Vercel Edge

export async function POST(req: Request) {
  try {
    const { key } = await req.json() as { key?: string };

    if (!key || typeof key !== "string") {
      return NextResponse.json({ valid: false, reason: "no_key" }, { status: 400 });
    }

    const secret = process.env.LICENSE_SECRET;
    if (!secret) {
      console.error("LICENSE_SECRET not configured");
      return NextResponse.json({ valid: false, reason: "server_error" }, { status: 500 });
    }

    const result = await verifyKey(secret, key.trim());

    // Never expose the secret or internal details in the response
    return NextResponse.json({
      valid:       result.valid,
      type:        result.valid ? result.type        : undefined,
      expiresOn:   result.valid ? result.expiresOn   : undefined,
      expiryLabel: result.valid ? result.expiryLabel : undefined,
      // Return a generic error on failure (don't leak "invalid_signature" etc.)
      reason: !result.valid
        ? (result.reason === "expired" ? "expired" : "invalid")
        : undefined,
    });
  } catch {
    return NextResponse.json({ valid: false, reason: "server_error" }, { status: 500 });
  }
}