-- Add direction enum and columns for batch_shipments
DO $$ BEGIN
  CREATE TYPE batch_direction AS ENUM ('indonesia_to_japan', 'japan_to_indonesia');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE batch_shipments
  ADD COLUMN IF NOT EXISTS direction batch_direction NOT NULL DEFAULT 'japan_to_indonesia',
  ADD COLUMN IF NOT EXISTS max_weight_kg DECIMAL(7,2) NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS departure_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- Admin CRUD functions
CREATE OR REPLACE FUNCTION admin_create_batch(
  p_name TEXT,
  p_direction batch_direction,
  p_departure_date DATE,
  p_arrives_at DATE,
  p_closes_at TIMESTAMPTZ,
  p_capacity INTEGER,
  p_max_weight_kg DECIMAL(7,2),
  p_price_per_kg INTEGER,
  p_savings_percent INTEGER DEFAULT 0
) RETURNS batch_shipments AS $$
DECLARE
  v_route TEXT;
  v_result batch_shipments;
BEGIN
  IF p_direction = 'japan_to_indonesia' THEN
    v_route := 'Jepang → Indonesia';
  ELSE
    v_route := 'Indonesia → Jepang';
  END IF;

  INSERT INTO batch_shipments (name, route, direction, departure_date, arrives_at, closes_at, capacity, max_weight_kg, price_per_kg, savings_percent)
  VALUES (p_name, v_route, p_direction, p_departure_date, p_arrives_at, p_closes_at, p_capacity, p_max_weight_kg, p_price_per_kg, p_savings_percent)
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION admin_update_batch(
  p_id UUID,
  p_name TEXT,
  p_direction batch_direction,
  p_departure_date DATE,
  p_arrives_at DATE,
  p_closes_at TIMESTAMPTZ,
  p_capacity INTEGER,
  p_max_weight_kg DECIMAL(7,2),
  p_price_per_kg INTEGER,
  p_savings_percent INTEGER,
  p_status batch_status
) RETURNS batch_shipments AS $$
DECLARE
  v_route TEXT;
  v_result batch_shipments;
BEGIN
  IF p_direction = 'japan_to_indonesia' THEN
    v_route := 'Jepang → Indonesia';
  ELSE
    v_route := 'Indonesia → Jepang';
  END IF;

  UPDATE batch_shipments SET
    name = p_name,
    route = v_route,
    direction = p_direction,
    departure_date = p_departure_date,
    arrives_at = p_arrives_at,
    closes_at = p_closes_at,
    capacity = p_capacity,
    max_weight_kg = p_max_weight_kg,
    price_per_kg = p_price_per_kg,
    savings_percent = p_savings_percent,
    status = p_status
  WHERE id = p_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION admin_delete_batch(p_id UUID) RETURNS VOID AS $$
BEGIN
  DELETE FROM batch_participants WHERE batch_id = p_id;
  DELETE FROM batch_shipments WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
