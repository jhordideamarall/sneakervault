import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seedEmployees() {
  const employees = [
    { email: "budi@sneakervault.com", name: "Budi Gudang", role: "admin_gudang" },
    { email: "siti@sneakervault.com", name: "Siti Online", role: "admin_online" },
    { email: "agus@sneakervault.com", name: "Agus Shopkeeper", role: "shopkeeper" },
  ];

  console.log("🚀 Seeding employees...");

  for (const emp of employees) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: emp.email,
      password: "employee123456",
      email_confirm: true,
      user_metadata: { full_name: emp.name },
    });

    if (error) {
      if (error.message.includes("already been registered")) {
        console.log(`✓ ${emp.name} already exists`);
      } else {
        console.error(`✗ Failed to create ${emp.name}:`, error.message);
        continue;
      }
    } else {
      console.log(`✓ Created ${emp.name}`);
    }

    // Assign role
    const { error: rpcError } = await supabase.rpc("bootstrap_employee_role", {
      p_email: emp.email,
      p_role: emp.role,
    });

    if (rpcError) {
      console.error(`✗ Failed to assign role to ${emp.name}:`, rpcError.message);
    } else {
      console.log(`✓ Assigned ${emp.role} to ${emp.name}`);
    }
  }

  // Now seed some activities for these new users
  console.log("\n📈 Generating activities for employees...");
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, roles");
  const { data: products } = await supabase.from("products").select("id, brand, model, sku, size").limit(3);

  if (profiles && products) {
    for (const p of profiles) {
      if (p.roles.includes("admin_gudang")) {
        await supabase.from("activity_logs").insert({
          user_id: p.id,
          action: "scan_in",
          entity_type: "product",
          entity_id: products[0].id,
          new_data: { 
            brand: products[0].brand, 
            model: products[0].model, 
            sku: products[0].sku, 
            size: products[0].size, 
            quantity: 50, 
            unit_cost: 1200000 
          },
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
        });
      }
      if (p.roles.includes("shopkeeper")) {
        await supabase.from("activity_logs").insert({
          user_id: p.id,
          action: "scan_out",
          entity_type: "packing_item",
          entity_id: products[1].id,
          new_data: { 
            brand: products[1].brand, 
            model: products[1].model, 
            sku: products[1].sku, 
            size: products[1].size 
          },
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 1).toISOString(),
        });
      }
      if (p.roles.includes("admin_online")) {
        await supabase.from("activity_logs").insert({
          user_id: p.id,
          action: "status_change",
          entity_type: "packing_session",
          entity_id: "77777777-7777-7777-7777-777777777777",
          new_data: { status: "completed", order_id: "ORD-999" },
          created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        });
      }
    }
    console.log("✓ Activity logs generated");
  }
}

seedEmployees();
