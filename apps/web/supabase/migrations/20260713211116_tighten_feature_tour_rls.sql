REVOKE DELETE ON TABLE public.user_feature_tour_states FROM authenticated;

DROP POLICY IF EXISTS "Users manage own feature tour states"
  ON public.user_feature_tour_states;
DROP POLICY IF EXISTS "Users can read own feature tour states"
  ON public.user_feature_tour_states;
DROP POLICY IF EXISTS "Users can insert own feature tour states"
  ON public.user_feature_tour_states;
DROP POLICY IF EXISTS "Users can update own feature tour states"
  ON public.user_feature_tour_states;

CREATE POLICY "Users can read own feature tour states"
  ON public.user_feature_tour_states
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own feature tour states"
  ON public.user_feature_tour_states
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own feature tour states"
  ON public.user_feature_tour_states
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.user_feature_tour_states
  TO authenticated;
