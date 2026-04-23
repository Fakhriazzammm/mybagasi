-- Migration: scrape_jobs table
-- Created: 2026-04-25

-- ============================================================
-- Table: scrape_jobs
-- ============================================================
CREATE TABLE IF NOT EXISTS scrape_jobs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  url          text        NOT NULL,
  status       text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  job_type     text        NOT NULL DEFAULT 'scrape_product'
                            CHECK (job_type IN ('scrape_product', 'search_web')),
  keyword      text,
  result       jsonb,
  error        text,
  user_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status     ON scrape_jobs (status);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_created_at ON scrape_jobs (created_at);

-- ============================================================
-- Row-Level Security
-- ============================================================
ALTER TABLE scrape_jobs ENABLE ROW LEVEL SECURITY;

-- Service role can do anything
CREATE POLICY "Service role can do anything"
  ON scrape_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anyone can INSERT (anonymous scrape requests)
CREATE POLICY "Anyone can insert"
  ON scrape_jobs
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Authenticated users can SELECT their own jobs
CREATE POLICY "Users can select own jobs"
  ON scrape_jobs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Anonymous users can SELECT jobs by id (for polling a specific job)
CREATE POLICY "Anon can select by id"
  ON scrape_jobs
  FOR SELECT
  TO anon
  USING (true);

-- ============================================================
-- Trigger: auto-update updated_at on row change
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_scrape_jobs_updated_at
  BEFORE UPDATE ON scrape_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- Realtime: publish scrape_jobs changes
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE scrape_jobs;
