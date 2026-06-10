-- ============================================================
-- MyBagasi - Bot Memory (per-user, persistent)
-- ============================================================

CREATE TABLE IF NOT EXISTS bot_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bot_memories_user_id ON bot_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_bot_memories_key ON bot_memories(key);

-- RLS
ALTER TABLE bot_memories ENABLE ROW LEVEL SECURITY;

-- Policy: user can CRUD their own memories only
CREATE POLICY "memories_crud_own" ON bot_memories
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at
CREATE TRIGGER update_bot_memories_updated_at
  BEFORE UPDATE ON bot_memories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Function: upsert memory (for Edge Function)
CREATE OR REPLACE FUNCTION upsert_memory(
  p_user_id UUID,
  p_key TEXT,
  p_value JSONB
) RETURNS bot_memories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result bot_memories;
BEGIN
  INSERT INTO bot_memories (user_id, key, value)
  VALUES (p_user_id, p_key, p_value)
  ON CONFLICT (user_id, key)
  DO UPDATE SET value = p_value, updated_at = NOW()
  RETURNING * INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Function: get user memories (for Edge Function)
CREATE OR REPLACE FUNCTION get_user_memories(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_object_agg(key, value)
  INTO v_result
  FROM bot_memories
  WHERE user_id = p_user_id;
  
  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;
