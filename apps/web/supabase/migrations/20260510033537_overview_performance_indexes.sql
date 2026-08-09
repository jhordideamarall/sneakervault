CREATE INDEX IF NOT EXISTS idx_packing_sessions_completed_at ON packing_sessions(completed_at) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_packing_sessions_platform_order_id ON packing_sessions(platform_order_id);
