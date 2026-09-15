import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const fingerprint = process.env.ANDROID_APP_LINK_SHA256_CERT_FINGERPRINT;
  const packageName = process.env.ANDROID_APP_LINK_PACKAGE_NAME || "dev.joinbounty.app";
  if (!fingerprint) return new NextResponse(null, { status: 404 });
  return NextResponse.json([{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: [fingerprint] }
  }], { headers: { "Cache-Control": "public, max-age=300" } });
}

