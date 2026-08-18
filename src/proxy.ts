import { NextResponse, type NextRequest } from "next/server";
import { protectRecipeRequest } from "@/lib/recipe-request-protection";

export function proxy(request: NextRequest): NextResponse {
  const result = protectRecipeRequest(request);
  if (!result.allowed) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/recipes/:path*",
};
