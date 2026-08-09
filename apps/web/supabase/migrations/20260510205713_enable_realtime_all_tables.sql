
-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE activity_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER PUBLICATION supabase_realtime ADD TABLE packing_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE packing_items;
ALTER PUBLICATION supabase_realtime ADD TABLE returns;
ALTER PUBLICATION supabase_realtime ADD TABLE delete_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE purchase_batches;
