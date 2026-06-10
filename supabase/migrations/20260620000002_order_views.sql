-- ============================================================
-- MyBagasi - Order Views & Notify Triggers
-- ============================================================

-- ============================================================
-- VIEW: user_orders_summary
-- Orders with timeline event count and last event note
-- ============================================================
CREATE OR REPLACE VIEW public.user_orders_summary AS
SELECT
  o.id,
  o.user_id,
  o.product,
  o.source,
  o.price_jpy,
  o.exchange_rate,
  o.service_fee,
  o.shipping_cost,
  o.tax_customs,
  o.membership_discount,
  o.points_used,
  o.total,
  o.status,
  o.tracking_number,
  o.shipping_route,
  o.weight_kg,
  o.notes,
  o.eta,
  o.created_at,
  o.updated_at,
  -- Count of timeline events
  COALESCE(ot.event_count, 0) AS timeline_events,
  -- Last event note (most recent by occurred_at)
  ot_last.note AS last_event_note,
  ot_last.status AS last_event_status,
  ot_last.occurred_at AS last_event_at
FROM orders o
LEFT JOIN (
  SELECT order_id, COUNT(*) AS event_count
  FROM order_tracking
  GROUP BY order_id
) ot ON ot.order_id = o.id
LEFT JOIN LATERAL (
  SELECT note, status, occurred_at
  FROM order_tracking
  WHERE order_id = o.id
  ORDER BY occurred_at DESC
  LIMIT 1
) ot_last ON TRUE;

-- ============================================================
-- VIEW: recent_order_updates
-- Orders updated in the last 24 hours, joined with telegram_id
-- for bot notification dispatch
-- ============================================================
CREATE OR REPLACE VIEW public.recent_order_updates AS
SELECT
  o.id AS order_id,
  o.user_id,
  o.product,
  o.status,
  o.tracking_number,
  o.updated_at,
  o.created_at,
  p.telegram_id,
  p.name AS user_name,
  -- Include the latest tracking note if available
  ot_last.note AS latest_note,
  ot_last.occurred_at AS latest_event_at
FROM orders o
JOIN profiles p ON p.id = o.user_id
LEFT JOIN LATERAL (
  SELECT note, occurred_at
  FROM order_tracking
  WHERE order_id = o.id
  ORDER BY occurred_at DESC
  LIMIT 1
) ot_last ON TRUE
WHERE o.updated_at >= NOW() - INTERVAL '24 hours'
  AND p.telegram_id IS NOT NULL;

-- ============================================================
-- NOTIFY TRIGGER: Orders status/tracking_number changes
-- After UPDATE of status or tracking_number on orders,
-- send a JSON payload via pg_notify to 'order_changes' channel
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_order_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload TEXT;
BEGIN
  v_payload := json_build_object(
    'type', 'order_update',
    'order_id', NEW.id,
    'user_id', NEW.user_id,
    'old_status', OLD.status,
    'new_status', NEW.status,
    'old_tracking_number', OLD.tracking_number,
    'new_tracking_number', NEW.tracking_number,
    'changed_at', NOW()
  )::text;

  PERFORM pg_notify('order_changes', v_payload);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_order_changes ON orders;
CREATE TRIGGER trg_notify_order_changes
  AFTER UPDATE OF status, tracking_number ON orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status
     OR OLD.tracking_number IS DISTINCT FROM NEW.tracking_number)
  EXECUTE FUNCTION notify_order_changes();

-- ============================================================
-- NOTIFY TRIGGER: Order tracking INSERT
-- After INSERT on order_tracking, send a JSON payload
-- via pg_notify to 'order_changes' channel
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_order_tracking_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload TEXT;
  v_user_id UUID;
  v_tracking_number TEXT;
  v_order_status order_status;
BEGIN
  -- Fetch order details for the payload
  SELECT user_id, tracking_number, status
  INTO v_user_id, v_tracking_number, v_order_status
  FROM orders
  WHERE id = NEW.order_id;

  v_payload := json_build_object(
    'type', 'tracking_event',
    'tracking_id', NEW.id,
    'order_id', NEW.order_id,
    'user_id', v_user_id,
    'status', NEW.status,
    'note', NEW.note,
    'is_done', NEW.is_done,
    'is_current', NEW.is_current,
    'occurred_at', NEW.occurred_at,
    'order_tracking_number', v_tracking_number,
    'order_status', v_order_status,
    'changed_at', NOW()
  )::text;

  PERFORM pg_notify('order_changes', v_payload);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_order_tracking_insert ON order_tracking;
CREATE TRIGGER trg_notify_order_tracking_insert
  AFTER INSERT ON order_tracking
  FOR EACH ROW
  EXECUTE FUNCTION notify_order_tracking_insert();
