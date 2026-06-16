-- ============================================================
-- Auto-sync personal_shoppers.stats when review is added/updated/deleted
-- Menjaga rating & reviews_count tetap akurat secara real-time
-- ============================================================

-- Function to recalculate stats for a personal shopper
CREATE OR REPLACE FUNCTION sync_shopper_review_stats()
RETURNS TRIGGER AS $$
DECLARE
  v_shopper_id UUID;
BEGIN
  -- Determine which shopper_id to update
  IF TG_OP = 'DELETE' THEN
    v_shopper_id := OLD.shopper_id;
  ELSE
    v_shopper_id := NEW.shopper_id;
  END IF;

  -- Update the stats JSONB column with actual aggregate data
  UPDATE personal_shoppers
  SET stats = (
    SELECT jsonb_build_object(
      'orders_completed', COALESCE((stats->>'orders_completed')::int, 0),
      'rating', COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0),
      'reviews_count', COUNT(r.id)
    )
    FROM shopper_reviews r
    WHERE r.shopper_id = v_shopper_id
  )
  WHERE id = v_shopper_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: after insert/update/delete on shopper_reviews
DROP TRIGGER IF EXISTS trigger_sync_shopper_stats ON shopper_reviews;
CREATE TRIGGER trigger_sync_shopper_stats
  AFTER INSERT OR UPDATE OR DELETE ON shopper_reviews
  FOR EACH ROW EXECUTE FUNCTION sync_shopper_review_stats();

-- ============================================================
-- Recalculate stats for existing data
-- ============================================================
UPDATE personal_shoppers ps
SET stats = (
  SELECT jsonb_build_object(
    'orders_completed', COALESCE((ps.stats->>'orders_completed')::int, 0),
    'rating', COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0),
    'reviews_count', COUNT(r.id)
  )
  FROM shopper_reviews r
  WHERE r.shopper_id = ps.id
);
