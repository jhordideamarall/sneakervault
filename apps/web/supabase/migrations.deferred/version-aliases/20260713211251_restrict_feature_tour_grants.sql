REVOKE ALL PRIVILEGES ON TABLE public.user_feature_tour_states FROM authenticated;
GRANT SELECT, INSERT, UPDATE
  ON TABLE public.user_feature_tour_states
  TO authenticated;
