import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const requireFromWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createClient } = requireFromWeb("@supabase/supabase-js");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
loadEnvFile(path.join(repoRoot, ".env.local"));
loadEnvFile(path.join(repoRoot, "apps/web/.env.local"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY");
}

const isLocalSupabase =
  supabaseUrl.includes("127.0.0.1") || supabaseUrl.includes("localhost");
if (!isLocalSupabase && process.env.ALLOW_REMOTE_DEMO_SEED !== "true") {
  throw new Error(
    "Refusing to seed demo users on a remote Supabase project. Set ALLOW_REMOTE_DEMO_SEED=true when this is intentional.",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const demoUsers = [
  { email: "owner@sneakervault.com", password: "owner123456", full_name: "Jhordi Owner", role: "owner" },
  { email: "finance@sneakervault.com", password: "finance123456", full_name: "Rani Finance", role: "finance" },
  { email: "budi@sneakervault.com", password: "employee123456", full_name: "Budi Gudang", role: "admin_gudang" },
  { email: "siti@sneakervault.com", password: "employee123456", full_name: "Siti Online", role: "admin_online" },
  { email: "agus@sneakervault.com", password: "employee123456", full_name: "Agus Shopkeeper", role: "shopkeeper" },
];

const shouldResetPasswords = process.env.RESET_DEMO_PASSWORDS === "true";

async function findUserByEmail(email) {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 1000) return null;
    page += 1;
  }
}

async function ensureUser(user) {
  let authUser = await findUserByEmail(user.email);

  if (!authUser) {
    let { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { full_name: user.full_name },
    });
    if (error?.message?.includes("Database error creating new user")) {
      ({ data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
      }));
    }
    if (error) throw error;
    authUser = data.user;
  } else {
    const updatePayload = {
      email_confirm: true,
      user_metadata: { full_name: user.full_name },
    };
    if (shouldResetPasswords) updatePayload.password = user.password;

    const { error } = await supabase.auth.admin.updateUserById(authUser.id, updatePayload);
    if (error) throw error;
  }

  const profilePayload = {
    id: authUser.id,
    email: user.email,
    full_name: user.full_name,
    is_active: true,
  };

  const { error: profileError } = await supabase.from("profiles").upsert(profilePayload);
  if (profileError) throw profileError;

  const { error: prefError } = await supabase.from("notification_preferences").upsert({
    user_id: authUser.id,
    muted_event_types: [],
    digest_mode: false,
  });
  if (prefError) throw prefError;

  console.log(`${user.email} ready as ${user.role}`);
}

async function assignRolesAsOwner() {
  const owner = demoUsers.find((user) => user.role === "owner");
  if (!owner) throw new Error("Owner demo user is missing");

  const { error: bootstrapError } = await supabase.rpc("bootstrap_first_owner", {
    p_email: owner.email,
  });
  if (bootstrapError && !bootstrapError.message.includes("owner already exists")) {
    console.warn(`bootstrap_first_owner skipped: ${bootstrapError.message}`);
  }

  const ownerClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await ownerClient.auth.signInWithPassword({
    email: owner.email,
    password: owner.password,
  });
  if (signInError) throw signInError;

  for (const user of demoUsers) {
    const { data: profile, error: profileError } = await ownerClient
      .from("profiles")
      .select("id")
      .eq("email", user.email)
      .single();
    if (profileError) throw profileError;

    const { error: roleError } = await ownerClient
      .from("profiles")
      .update({
        full_name: user.full_name,
        roles: [user.role],
        is_active: true,
      })
      .eq("id", profile.id);
    if (roleError) throw roleError;
  }
}

for (const user of demoUsers) {
  await ensureUser(user);
}

await assignRolesAsOwner();
console.log("Demo roles assigned");
