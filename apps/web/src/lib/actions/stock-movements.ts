"use server";

import type { createClient } from "@sneakervault/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type StockMovementType =
  | "inbound"
  | "outbound"
  | "return_in"
  | "return_out"
  | "adjustment";

export type StockMovementInput = {
  product_id: string;
  type: StockMovementType;
  quantity: number;
  unit_cost?: number;
  reference_type?: string | null;
  reference_id?: string | null;
  notes?: string | null;
};

export async function createStockMovement(
  supabase: SupabaseClient,
  input: StockMovementInput,
) {
  const { data, error } = await supabase.rpc("create_stock_movement", {
    p_product_id: input.product_id,
    p_type: input.type,
    p_quantity: input.quantity,
    p_unit_cost: input.unit_cost ?? 0,
    p_reference_type: input.reference_type ?? null,
    p_reference_id: input.reference_id ?? null,
    p_notes: input.notes ?? null,
  });

  if (error) return { error: error.message };
  return { id: data as string };
}
