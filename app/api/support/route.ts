import { NextResponse } from "next/server";

export async function POST() {
  const supportEmail = process.env.OWNER_SUPPORT_EMAIL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supportEmail || !supabaseServiceRoleKey) {
    return NextResponse.json(
      { error: "Server configuration is incomplete." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Support endpoint is configured.",
  });
}