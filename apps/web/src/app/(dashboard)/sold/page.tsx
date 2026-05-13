import { getSoldHistory } from "@/lib/queries";
import { RiwayatTerjualClient } from "@/components/sold/riwayat-terjual-client";

export default async function SoldPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { data } = await getSoldHistory({
    platform: sp.platform,
    courier: sp.courier,
    limit: 100,
  });

  return (
    <RiwayatTerjualClient 
      initialSessions={data as any} 
      searchParams={sp} 
    />
  );
}
