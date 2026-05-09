import { NextResponse, type NextRequest } from "next/server";
import { getActiveProductsByModel } from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const brand = searchParams.get("brand") ?? "";
  const model = searchParams.get("model") ?? "";
  if (!brand || !model) return NextResponse.json([]);

  const products = await getActiveProductsByModel(brand, model);
  return NextResponse.json(products);
}
