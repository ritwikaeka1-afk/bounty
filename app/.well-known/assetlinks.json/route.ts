import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const fingerprints = (process.env.ANDROID_APP_LINK_SHA256_CERT_FINGERPRINT || "").split(",").map(value => value.trim()).filter(Boolean);
  const packageName = process.env.ANDROID_APP_LINK_PACKAGE_NAME || "dev.joinbounty.app";
  if (!fingerprints.length) return new NextResponse(null, { status: 404 });
  return NextResponse.json([{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: fingerprints }
  }], { headers: { "Cache-Control": "public, max-age=300" } });
}

