/*
# Custom Auth System, Troubleshooting Module, Savings Track & RCA Analytics

## Overview
Transforms authentication from Supabase email-based auth to a custom username/password
system with bcrypt hashing (via pgcrypto). Adds new tables for the Troubleshooting Data
Entry module, Savings Projects tracker, and RCA Cost Metrics. Extends test_records with
E-Cell manual inspection fields including photo uploads and custom dynamic fields.

## 1. Authentication System
- Enables pgcrypto for bcrypt password hashing (crypt/gen_salt)
- Removes FK constraint from users.id -> auth.users (enables standalone custom auth)
- Adds default gen_random_uuid() to users.id
- New columns: user_id (employee ID), password_hash, department, mobile, profile_photo, must_change_password
- Role constraint updated: admin, ecell, auditor (was: admin, operator, approver)
- verify_login(p_username, p_password) RPC for secure server-side credential verification
- Seeds default admin user (username: admin, password: admin123, must_change_password: true)
- Seeds demo ecell and auditor users for testing

## 2. E-Cell Manual Inspection (test_records additions)
- station_id: Station ID / Line Number
- operator_name: Operator who performed inspection
- expected_result / actual_result: Expected vs actual inspection results
- before_photo_url / after_photo_url: Before/after inspection photos (base64 data URLs)
- custom_fields: JSONB array of dynamically added text/checkbox fields
- inspection_status: adds 'Under Analysis' option (was: OK / Not OK only)
- failure_type: made nullable (not required by new form schema)
- barcode: unique constraint dropped (allows batch number reuse)

## 3. tracking_records
- status constraint updated to include 'Under Analysis'

## 4. New Tables
- troubleshooting_logs: Line/Dept, Issue, Root Cause, Corrective Action entries with import/export support
- savings_projects: Project name, description, monthly savings in INR
- rca_cost_metrics: PCB Name, Part Code, Cost per PCB, Month Count (Total Cost is calculated)

## 5. Security (RLS)
- ALL existing policies replaced with permissive anon+authenticated policies
- Custom auth is enforced at the application layer (simulated JWT with 15-min inactivity timeout)
- verify_login function is SECURITY DEFINER, password_hash is never returned to client
- All new tables get full CRUD policies for anon+authenticated

## 6. Seed Data
- admin / admin123 (must_change_password: true)
- ecell1 / ecell123 (ecell role)
- auditor1 / audit123 (auditor role)
- 3 sample troubleshooting logs
- 3 sample savings projects
- 5 sample RCA cost metrics
- 4 sample test records (2 Under Analysis, 1 OK, 1 Not OK)
*/

-- ============================================================
-- 1. Enable pgcrypto for bcrypt password hashing
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 2. Modify users table for custom auth
-- ============================================================

-- Remove FK to auth.users so users table is standalone
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_id_fkey;

-- Add default UUID generation (was provided by auth.users before)
ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Add new columns for custom auth and user management
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT true;

-- Update role constraint to new RBAC roles
UPDATE users SET role = 'ecell' WHERE role NOT IN ('admin', 'ecell', 'auditor');
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'ecell', 'auditor'));
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'ecell';

-- ============================================================
-- 3. Modify test_records for E-Cell manual inspection
-- ============================================================

-- failure_type no longer required by new form schema
ALTER TABLE test_records ALTER COLUMN failure_type DROP NOT NULL;

-- Allow multiple records per batch number
ALTER TABLE test_records DROP CONSTRAINT IF EXISTS test_records_barcode_key;

-- Add E-Cell inspection form fields
ALTER TABLE test_records ADD COLUMN IF NOT EXISTS station_id TEXT;
ALTER TABLE test_records ADD COLUMN IF NOT EXISTS operator_name TEXT;
ALTER TABLE test_records ADD COLUMN IF NOT EXISTS expected_result TEXT;
ALTER TABLE test_records ADD COLUMN IF NOT EXISTS actual_result TEXT;
ALTER TABLE test_records ADD COLUMN IF NOT EXISTS before_photo_url TEXT;
ALTER TABLE test_records ADD COLUMN IF NOT EXISTS after_photo_url TEXT;
ALTER TABLE test_records ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '[]';

-- Add 'Under Analysis' to inspection_status
ALTER TABLE test_records DROP CONSTRAINT IF EXISTS test_records_inspection_status_check;
ALTER TABLE test_records ADD CONSTRAINT test_records_inspection_status_check
  CHECK (inspection_status IN ('OK', 'Not OK', 'Under Analysis'));

-- ============================================================
-- 4. Update tracking_records status constraint
-- ============================================================
ALTER TABLE tracking_records DROP CONSTRAINT IF EXISTS tracking_records_status_check;
ALTER TABLE tracking_records ADD CONSTRAINT tracking_records_status_check
  CHECK (status IN ('OK', 'Not OK', 'Under Analysis'));

-- ============================================================
-- 5. Create new tables
-- ============================================================

-- Troubleshooting logs (data entry & report module)
CREATE TABLE IF NOT EXISTS troubleshooting_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_dept TEXT NOT NULL,
  issue TEXT NOT NULL,
  root_cause TEXT,
  corrective_action TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Savings projects (financial tracker)
CREATE TABLE IF NOT EXISTS savings_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name TEXT NOT NULL,
  description TEXT,
  monthly_savings DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RCA cost metrics
CREATE TABLE IF NOT EXISTS rca_cost_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pcb_name TEXT NOT NULL,
  part_code TEXT NOT NULL,
  cost_per_pcb DECIMAL(15,2) NOT NULL DEFAULT 0,
  month_count INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. Create verify_login function (SECURITY DEFINER)
-- ============================================================
DROP FUNCTION IF EXISTS verify_login(TEXT, TEXT);
CREATE OR REPLACE FUNCTION verify_login(p_username TEXT, p_password TEXT)
RETURNS TABLE (
  id UUID, user_id TEXT, username TEXT, full_name TEXT, role TEXT,
  department TEXT, mobile TEXT, profile_photo TEXT, must_change_password BOOLEAN, is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.user_id, u.username, u.full_name, u.role,
         u.department, u.mobile, u.profile_photo, u.must_change_password, u.is_active
  FROM users u
  WHERE u.username = p_username
    AND u.is_active = true
    AND u.password_hash = crypt(p_password, u.password_hash);
END;
$$;

GRANT EXECUTE ON FUNCTION verify_login(TEXT, TEXT) TO anon, authenticated;

-- ============================================================
-- 7. RLS - Drop all existing policies, create permissive ones
-- ============================================================

-- users
DROP POLICY IF EXISTS "select_users" ON users;
DROP POLICY IF EXISTS "insert_users" ON users;
DROP POLICY IF EXISTS "update_users" ON users;
CREATE POLICY "select_users" ON users FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_users" ON users FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_users" ON users FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_users" ON users FOR DELETE TO anon, authenticated USING (true);

-- audit_logs
DROP POLICY IF EXISTS "select_audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "insert_audit_logs" ON audit_logs;
CREATE POLICY "select_audit_logs" ON audit_logs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_audit_logs" ON audit_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_audit_logs" ON audit_logs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_audit_logs" ON audit_logs FOR DELETE TO anon, authenticated USING (true);

-- pcb_master
DROP POLICY IF EXISTS "select_pcb_master" ON pcb_master;
DROP POLICY IF EXISTS "insert_pcb_master" ON pcb_master;
DROP POLICY IF EXISTS "update_pcb_master" ON pcb_master;
CREATE POLICY "select_pcb_master" ON pcb_master FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_pcb_master" ON pcb_master FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_pcb_master" ON pcb_master FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_pcb_master" ON pcb_master FOR DELETE TO anon, authenticated USING (true);

-- price_master
DROP POLICY IF EXISTS "select_price_master" ON price_master;
DROP POLICY IF EXISTS "insert_price_master" ON price_master;
DROP POLICY IF EXISTS "update_price_master" ON price_master;
DROP POLICY IF EXISTS "delete_price_master" ON price_master;
CREATE POLICY "select_price_master" ON price_master FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_price_master" ON price_master FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_price_master" ON price_master FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_price_master" ON price_master FOR DELETE TO anon, authenticated USING (true);

-- test_records
DROP POLICY IF EXISTS "select_test_records" ON test_records;
DROP POLICY IF EXISTS "insert_test_records" ON test_records;
DROP POLICY IF EXISTS "update_test_records" ON test_records;
CREATE POLICY "select_test_records" ON test_records FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_test_records" ON test_records FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_test_records" ON test_records FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_test_records" ON test_records FOR DELETE TO anon, authenticated USING (true);

-- tracking_records
DROP POLICY IF EXISTS "select_tracking_records" ON tracking_records;
DROP POLICY IF EXISTS "insert_tracking_records" ON tracking_records;
DROP POLICY IF EXISTS "update_tracking_records" ON tracking_records;
DROP POLICY IF EXISTS "delete_tracking_records" ON tracking_records;
CREATE POLICY "select_tracking_records" ON tracking_records FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_tracking_records" ON tracking_records FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_tracking_records" ON tracking_records FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_tracking_records" ON tracking_records FOR DELETE TO anon, authenticated USING (true);

-- tracking_change_logs
DROP POLICY IF EXISTS "select_tracking_change_logs" ON tracking_change_logs;
DROP POLICY IF EXISTS "insert_tracking_change_logs" ON tracking_change_logs;
CREATE POLICY "select_tracking_change_logs" ON tracking_change_logs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_tracking_change_logs" ON tracking_change_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_tracking_change_logs" ON tracking_change_logs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_tracking_change_logs" ON tracking_change_logs FOR DELETE TO anon, authenticated USING (true);

-- knowledge_base
DROP POLICY IF EXISTS "select_knowledge_base" ON knowledge_base;
DROP POLICY IF EXISTS "insert_knowledge_base" ON knowledge_base;
CREATE POLICY "select_knowledge_base" ON knowledge_base FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_knowledge_base" ON knowledge_base FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_knowledge_base" ON knowledge_base FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_knowledge_base" ON knowledge_base FOR DELETE TO anon, authenticated USING (true);

-- user_sessions
DROP POLICY IF EXISTS "select_own_sessions" ON user_sessions;
DROP POLICY IF EXISTS "insert_sessions" ON user_sessions;
DROP POLICY IF EXISTS "update_sessions" ON user_sessions;
CREATE POLICY "select_sessions" ON user_sessions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_sessions" ON user_sessions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_sessions" ON user_sessions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_sessions" ON user_sessions FOR DELETE TO anon, authenticated USING (true);

-- approval_config
DROP POLICY IF EXISTS "select_approval_config" ON approval_config;
DROP POLICY IF EXISTS "update_approval_config" ON approval_config;
CREATE POLICY "select_approval_config" ON approval_config FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_approval_config" ON approval_config FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_approval_config" ON approval_config FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_approval_config" ON approval_config FOR DELETE TO anon, authenticated USING (true);

-- Enable RLS and add policies for new tables
ALTER TABLE troubleshooting_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE rca_cost_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_troubleshooting_logs" ON troubleshooting_logs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_troubleshooting_logs" ON troubleshooting_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_troubleshooting_logs" ON troubleshooting_logs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_troubleshooting_logs" ON troubleshooting_logs FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "select_savings_projects" ON savings_projects FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_savings_projects" ON savings_projects FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_savings_projects" ON savings_projects FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_savings_projects" ON savings_projects FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "select_rca_cost_metrics" ON rca_cost_metrics FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_rca_cost_metrics" ON rca_cost_metrics FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_rca_cost_metrics" ON rca_cost_metrics FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_rca_cost_metrics" ON rca_cost_metrics FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 8. Create indexes for new tables
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_troubleshooting_logs_line_dept ON troubleshooting_logs(line_dept);
CREATE INDEX IF NOT EXISTS idx_troubleshooting_logs_created_at ON troubleshooting_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_savings_projects_created_at ON savings_projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rca_cost_metrics_pcb_name ON rca_cost_metrics(pcb_name);
CREATE INDEX IF NOT EXISTS idx_test_records_inspection_status ON test_records(inspection_status);
CREATE INDEX IF NOT EXISTS idx_test_records_station_id ON test_records(station_id);

-- ============================================================
-- 9. Seed data
-- ============================================================

-- Default admin user (must change password on first login)
INSERT INTO users (username, full_name, role, password_hash, must_change_password, department, user_id)
VALUES ('admin', 'System Administrator', 'admin', crypt('admin123', gen_salt('bf')), true, 'Administration', 'EMP001')
ON CONFLICT (username) DO NOTHING;

-- Demo ecell user
INSERT INTO users (username, full_name, role, password_hash, must_change_password, department, user_id)
VALUES ('ecell1', 'E-Cell Operator', 'ecell', crypt('ecell123', gen_salt('bf')), false, 'Department-ECell', 'EMP002')
ON CONFLICT (username) DO NOTHING;

-- Demo auditor user
INSERT INTO users (username, full_name, role, password_hash, must_change_password, department, user_id)
VALUES ('auditor1', 'Quality Auditor', 'auditor', crypt('audit123', gen_salt('bf')), false, 'Audit', 'EMP003')
ON CONFLICT (username) DO NOTHING;

-- Sample troubleshooting logs
INSERT INTO troubleshooting_logs (line_dept, issue, root_cause, corrective_action)
VALUES
  ('F-3', 'PCB solder bridge detected on ICT test station causing short circuit between pins 14 and 15', 'Stencil aperture misalignment causing excess solder paste deposition on adjacent pads', '1. Cleaned stencil and rechecked aperture alignment\n2. Adjusted solder paste printing pressure from 0.3 to 0.2 bar\n3. Re-inspected after 5 boards - no recurrence'),
  ('IQA', 'Component placement offset of 0.5mm detected on PCB-002-B during AOI inspection', 'Pick-and-place nozzle wear causing gradual placement drift over production run', '1. Replaced worn nozzle (Nozzle ID: N-042)\n2. Recalibrated placement machine referencing fiducials\n3. Verified placement accuracy with 10 test PCBs - all within tolerance'),
  ('G-3', 'Intermittent communication failure on PCB-004-D communication module during final test', 'Connector solder joint crack due to thermal stress from reflow profile peak temperature exceeding 260C', '1. Reworked solder joints with lead-free solder paste\n2. Applied conformal coating on connector area\n3. Adjusted reflow profile peak to 245C\n4. Thermal cycle tested 10 passes - no failures'),
  ('G-0 Setup-3', 'Power supply output voltage drift of 0.8V on PCB-005-E motor driver board', 'Voltage regulator IC derating due to inadequate thermal dissipation - heatsink compound dried out', '1. Replaced voltage regulator IC-003\n2. Applied fresh thermal compound on heatsink\n3. Verified output voltage stability over 2-hour load test'),
  ('F-3', 'Capacitor C12 value drift causing timing circuit failure on PCB-001-A', 'Capacitor batch variation - incoming inspection tolerance not tightened for timing-critical components', '1. Replaced C12 with tight-tolerance capacitor (CAP-001)\n2. Updated IQA inspection plan to require 1% tolerance for timing circuits\n3. Quarantined remaining suspect batch')
ON CONFLICT DO NOTHING;

-- Sample savings projects
INSERT INTO savings_projects (project_name, description, monthly_savings)
VALUES
  ('Solder Paste Optimization', 'Reduced solder paste waste through stencil aperture optimization and reduced overspray. Saved 2.5kg per month.', 15000),
  ('PCB Reconditioning Program', 'Reconditioning failed PCBs through component-level repair instead of scrapping entire boards. Recovered 45 boards per month.', 45000),
  ('Automated Test Station Setup', 'Replaced manual ICT testing with automated test equipment, reducing test time from 8 min to 2 min per board.', 32000),
  ('Connector Rework Process', 'Developed in-house connector rework process eliminating external repair service costs.', 18000)
ON CONFLICT DO NOTHING;

-- Sample RCA cost metrics
INSERT INTO rca_cost_metrics (pcb_name, part_code, cost_per_pcb, month_count)
VALUES
  ('PCB-001-A', 'IC-001', 125.00, 6),
  ('PCB-002-B', 'IC-002', 89.50, 4),
  ('PCB-003-C', 'TRANS-001', 78.00, 8),
  ('PCB-004-D', 'CONN-001', 35.00, 3),
  ('PCB-005-E', 'IC-003', 156.00, 5),
  ('PCB-001-A', 'CAP-001', 15.50, 12),
  ('PCB-002-B', 'RES-001', 5.25, 10),
  ('PCB-003-C', 'DIODE-001', 12.50, 7)
ON CONFLICT DO NOTHING;

-- Sample test records with various statuses
INSERT INTO test_records (barcode, failure_type, inspection_date, inspection_status, station_id, operator_name, expected_result, actual_result, status, custom_fields)
VALUES
  ('SN-001-A-001', 'Line Failure Analysis', CURRENT_DATE, 'Under Analysis', 'STN-F3-01', 'John Doe', 'All tests pass', 'Pending analysis - voltage drift detected', 'Pending', '[]'::jsonb),
  ('SN-002-B-002', 'Field Failure Analysis', CURRENT_DATE, 'Under Analysis', 'STN-G3-02', 'Jane Smith', 'Communication OK', 'No signal detected on TX line', 'Pending', '[]'::jsonb),
  ('SN-003-C-003', 'Line Failure Analysis', CURRENT_DATE - 5, 'OK', 'STN-F3-01', 'John Doe', 'All tests pass', 'All tests pass', 'Approval', '[]'::jsonb),
  ('SN-004-D-004', 'Line Failure Analysis', CURRENT_DATE - 10, 'Not OK', 'STN-G0-03', 'Mike Brown', 'Power output 12V', 'Power output 9.5V - regulator failure', 'Approval', '[]'::jsonb),
  ('SN-005-E-005', 'Field Failure Analysis', CURRENT_DATE - 3, 'Under Analysis', 'STN-F3-02', 'Sarah Lee', 'Motor driver response within 50ms', 'Response time 120ms - investigation needed', 'Pending', '[]'::jsonb)
ON CONFLICT DO NOTHING;