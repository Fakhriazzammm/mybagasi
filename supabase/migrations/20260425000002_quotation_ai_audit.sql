-- Smart quotation confidence + audit trail

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS confidence_score SMALLINT,
  ADD COLUMN IF NOT EXISTS confidence_label TEXT,
  ADD COLUMN IF NOT EXISTS price_history JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS assistant_summary JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_confidence_score_range
  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100));

CREATE TABLE IF NOT EXISTS public.quotation_ai_audits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  input_url TEXT,
  input_query TEXT,
  input_budget TEXT,
  confidence_score SMALLINT NOT NULL,
  confidence_label TEXT NOT NULL,
  confidence_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  price_history JSONB NOT NULL DEFAULT '{}'::jsonb,
  similar_count INTEGER NOT NULL DEFAULT 0,
  estimation_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quotation_ai_audits_confidence_score_range CHECK (confidence_score >= 0 AND confidence_score <= 100)
);

CREATE INDEX IF NOT EXISTS idx_quotation_ai_audits_quotation_id ON public.quotation_ai_audits(quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotation_ai_audits_user_id ON public.quotation_ai_audits(user_id);

ALTER TABLE public.quotation_ai_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotation_ai_audits_select_own"
  ON public.quotation_ai_audits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "quotation_ai_audits_insert_own"
  ON public.quotation_ai_audits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "quotation_ai_audits_select_staff"
  ON public.quotation_ai_audits FOR SELECT
  USING (auth_user_role() IN ('ops_admin', 'super_admin'));
