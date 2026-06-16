-- ============================================================
-- BATCH SHOPPER SCHEDULES (many-to-many)
-- Link personal shoppers ke batch shipping schedules
-- ============================================================
CREATE TABLE IF NOT EXISTS batch_shopper_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES batch_shipments(id) ON DELETE CASCADE,
  shopper_id UUID NOT NULL REFERENCES personal_shoppers(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(batch_id, shopper_id)
);

CREATE INDEX IF NOT EXISTS idx_bss_batch ON batch_shopper_schedules(batch_id);
CREATE INDEX IF NOT EXISTS idx_bss_shopper ON batch_shopper_schedules(shopper_id);

ALTER TABLE batch_shopper_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bss_select_public" ON batch_shopper_schedules
  FOR SELECT USING (TRUE);

CREATE POLICY "bss_all_admin" ON batch_shopper_schedules
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ops_admin', 'super_admin'))
  );

ALTER PUBLICATION supabase_realtime ADD TABLE batch_shopper_schedules;

-- SEED: link semua personal shopper ke semua batch shipments aktif
DO $$
DECLARE
  v_shopper_ids UUID[];
  v_shopper_id UUID;
  v_batch_id UUID;
  v_first_batch UUID;
BEGIN
  -- Kumpulkan semua shopper IDs
  SELECT ARRAY_AGG(id) INTO v_shopper_ids
  FROM personal_shoppers WHERE is_active = TRUE;

  -- Dapatkan batch terdekat untuk primary
  SELECT id INTO v_first_batch
  FROM batch_shipments
  WHERE status IN ('open', 'closing_soon')
  ORDER BY departure_date ASC
  LIMIT 1;

  -- Insert untuk setiap shopper
  FOREACH v_shopper_id IN ARRAY v_shopper_ids
  LOOP
    FOR v_batch_id IN SELECT id FROM batch_shipments WHERE status IN ('open', 'closing_soon')
    LOOP
      INSERT INTO batch_shopper_schedules (batch_id, shopper_id, is_primary)
      VALUES (v_batch_id, v_shopper_id, v_batch_id = v_first_batch)
      ON CONFLICT (batch_id, shopper_id) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
