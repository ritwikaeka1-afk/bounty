import { NextResponse } from "next/server";

export async function POST() {
  // Legacy endpoint never persisted requests. New form uses authenticated RPC.
  return NextResponse.json({ error: "Please sign in and use the Help form to save a support request." }, { status: 410 });
}
