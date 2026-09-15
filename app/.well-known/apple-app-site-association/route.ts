import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const teamId = process.env.APPLE_APP_TEAM_ID;
  const bundleId = process.env.APPLE_BUNDLE_ID || "dev.joinbounty.app";
  if (!teamId) return new NextResponse(null, { status: 404 });
  return NextResponse.json({
    applinks: { apps: [], details: [{ appID: `${teamId}.${bundleId}`, paths: ["/*"] }] }
  }, { headers: { "Cache-Control": "public, max-age=300" } });
}

