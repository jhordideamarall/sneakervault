import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/actions/auth";
import { createClient } from "@sneakervault/supabase/server";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ products: [], orders: [] });

  const supabase = await createClient();
  const pattern = `%${q}%`;

  // Search products (by brand, model, or barcode)
  const { data: products } = await supabase
    .from("products")
    .select("id, brand, model, size, barcode, image_url, quantity")
    .or(`brand.ilike.${pattern},model.ilike.${pattern},barcode.ilike.${pattern}`)
    .limit(6);

  // Search orders (by platform order id)
  const { data: orders, error: ordersError } = await supabase
    .from("packing_sessions")
    .select("id, platform_order_id, platform, status, created_at")
    .ilike("platform_order_id", pattern)
    .limit(4);

  return NextResponse.json({
    products: products ?? [],
    orders: ordersError ? [] : (orders ?? []),
  });
}
