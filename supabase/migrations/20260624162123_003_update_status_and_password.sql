-- Update report status to use new values
-- First, update any existing records
UPDATE test_records SET status = 'Pending' WHERE status = 'Pending';

-- Alter the constraint to allow new status values
ALTER TABLE test_records DROP CONSTRAINT test_records_status_check;
ALTER TABLE test_records ADD CONSTRAINT test_records_status_check 
  CHECK (status IN ('Pending', 'Approval', 'In Process', 'Rejected'));

-- Update tracking_records report_status
ALTER TABLE tracking_records ALTER COLUMN report_status TYPE TEXT;
UPDATE tracking_records SET report_status = 'Pending' WHERE report_status = 'Pending';

-- Add a table for approval passwords (for verification)
CREATE TABLE IF NOT EXISTS approval_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  approval_password TEXT NOT NULL DEFAULT 'Bluestar@123',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- Insert default password config
INSERT INTO approval_config (approval_password) VALUES ('Bluestar@123')
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE approval_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "select_approval_config" ON approval_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "update_approval_config" ON approval_config FOR UPDATE TO authenticated 
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));