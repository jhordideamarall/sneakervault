CREATE TABLE IF NOT EXISTS public.user_feature_tour_states (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tour_key TEXT NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_feature_tour_states_tour_key_not_blank
    CHECK (length(trim(tour_key)) > 0),
  PRIMARY KEY (user_id, tour_key)
);

ALTER TABLE public.user_feature_tour_states ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_feature_tour_states FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.user_feature_tour_states
  TO authenticated;

DROP POLICY IF EXISTS "Users manage own feature tour states"
  ON public.user_feature_tour_states;
CREATE POLICY "Users manage own feature tour states"
  ON public.user_feature_tour_states
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS user_feature_tour_states_tour_key_idx
  ON public.user_feature_tour_states(tour_key, dismissed_at DESC);

COMMENT ON TABLE public.user_feature_tour_states IS
  'Per-user dismissal state for dashboard feature highlight tours.';
COMMENT ON COLUMN public.user_feature_tour_states.tour_key IS
  'Versioned key for a feature tour. New feature campaigns should use a new key.';
