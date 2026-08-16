import { NextResponse } from "next/server";
import { getSavedRecipeStore } from "@/lib/saved-recipe-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    getSavedRecipeStore().check();
    return NextResponse.json({ status: "ok" });
  } catch (error: unknown) {
    console.error("Health check failed.", error);
    return NextResponse.json(
      { status: "unhealthy" },
      { status: 503 },
    );
  }
}
