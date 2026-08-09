-- ============================================================================
-- SneakerVault — 02: Triggers
-- ============================================================================
-- Depends on functions defined in 01_functions.sql.
-- ============================================================================

-- Auto-create profile row on signup.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Maintain updated_at for mutable tables.
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_packing_sessions_updated_at
  BEFORE UPDATE ON packing_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Prevent non-owner users from changing their own `roles` field.
-- This is defense-in-depth: RLS also restricts profile updates.
CREATE TRIGGER guard_profiles_roles
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_roles();
