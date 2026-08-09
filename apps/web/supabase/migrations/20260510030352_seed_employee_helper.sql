CREATE OR REPLACE FUNCTION public.bootstrap_employee_role(p_email text, p_role user_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id uuid;
BEGIN
  SELECT id INTO target_id
  FROM profiles
  WHERE email = p_email;

  IF target_id IS NULL THEN
    RAISE EXCEPTION 'No profile found for email %', p_email;
  END IF;

  UPDATE profiles
  SET roles = ARRAY[p_role]
  WHERE id = target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_employee_role(text, user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_employee_role(text, user_role) TO anon;
