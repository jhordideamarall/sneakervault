import { getInventoryProducts } from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { InventoryClient } from "@/components/inventory/inventory-client";

const INVENTORY_MODEL_PAGE_SIZE = 50;

function readFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readPositiveInt(value: string | string[] | undefined, fallback: number) {
  const parsed = Number(readFirst(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const page = readPositiveInt(sp.page, 1);
  const search = (readFirst(sp.q) ?? "").trim();
  const [profile, productsRes] = await Promise.all([
    getCurrentUser(),
    getInventoryProducts({
      page,
      limit: INVENTORY_MODEL_PAGE_SIZE,
      search: search || undefined,
    }),
  ]);
  const roles = (profile?.roles ?? []) as string[];
  return (
    <InventoryClient
      products={productsRes.data as Parameters<typeof InventoryClient>[0]["products"]}
      total={productsRes.totalSku}
      totalModels={productsRes.totalModels}
      page={productsRes.page}
      pageSize={productsRes.limit}
      searchQuery={search}
      summary={productsRes.summary}
      roles={roles}
    />
  );
}
