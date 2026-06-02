import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const isLocalSupabase =
  supabaseUrl.includes("127.0.0.1") || supabaseUrl.includes("localhost");
if (!isLocalSupabase && process.env.ALLOW_REMOTE_DEMO_SEED !== "true") {
  throw new Error(
    "Refusing to seed the default owner on a remote Supabase project. Set ALLOW_REMOTE_DEMO_SEED=true when this is intentional.",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seed() {
  // 1. Create owner user
  const { data, error } = await supabase.auth.admin.createUser({
    email: "owner@sneakervault.com",
    password: "owner123456",
    email_confirm: true,
    user_metadata: { full_name: "Radit" },
  });

  if (error) {
    if (error.message.includes("already been registered")) {
      console.log("✓ Owner user already exists");
    } else {
      console.error("✗ Failed to create user:", error.message);
      process.exit(1);
    }
  } else {
    console.log("✓ Owner user created:", data.user.email);
  }

  // 2. Promote to owner role
  const { error: rpcError } = await supabase.rpc("bootstrap_first_owner", {
    p_email: "owner@sneakervault.com",
  });

  if (rpcError) {
    if (rpcError.message.includes("already exists")) {
      console.log("✓ Owner role already assigned");
    } else {
      console.error("✗ Failed to assign owner role:", rpcError.message);
    }
  } else {
    console.log("✓ Owner role assigned");
  }

  console.log("\n🔑 Login credentials:");
  console.log("   Email:    owner@sneakervault.com");
  console.log("   Password: owner123456");
}

seed();
