-- Fix RLS for batch_shipments — allow ops_admin to CREATE/UPDATE/DELETE
-- Previously only super_admin could write, which broke /admin/jadwal for ops_admin

DROP POLICY IF EXISTS "batch_shipments_all_super" ON batch_shipments;
CREATE POLICY "batch_shipments_all_staff" ON batch_shipments
  FOR ALL
  USING (auth_user_role() IN ('ops_admin', 'super_admin'));
