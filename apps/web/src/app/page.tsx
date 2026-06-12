import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth";

// Landing page dinonaktifkan sementara — root "/" langsung ke login (atau
// workspace bila sudah login). Komponen landing tetap ada di
// src/components/landing/* dan halaman lama tersimpan di git history, jadi
// bisa diaktifkan lagi kapan saja.
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? "/workspace" : "/login");
}
