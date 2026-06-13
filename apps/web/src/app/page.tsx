import { redirect } from "next/navigation";

export default async function Home() {
  // Root is only a gate. Let /workspace middleware decide auth so "/" does not
  // pay an extra Supabase user/profile lookup before the real app loads.
  redirect("/workspace");
}
