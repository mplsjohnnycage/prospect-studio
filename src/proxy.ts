import { NextResponse, type NextRequest } from "next/server";
import { isAuthenticated } from "@/lib/auth-server";
export async function proxy(_request: NextRequest) {
  void _request;
  if (!(await isAuthenticated())) return NextResponse.json({error:"Sign in required"},{status:401});
  return NextResponse.next();
}
export const config = { matcher: ["/api/((?!auth|health|ready|cron|map/tiles|rivet/).*)"] };
