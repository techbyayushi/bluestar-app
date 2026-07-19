-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator', 'approver')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit logs for tracking all user actions
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PCB Master list
CREATE TABLE pcb_master (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pcb_name TEXT NOT NULL UNIQUE,
  drive_name TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Price Master (uploaded from Excel)
CREATE TABLE price_master (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  part_code TEXT NOT NULL UNIQUE,
  price DECIMAL(15,2) NOT NULL,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Test records from PCB Testing Module
CREATE TABLE test_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barcode TEXT NOT NULL UNIQUE,
  failure_type TEXT NOT NULL CHECK (failure_type IN ('Line Failure Analysis', 'Field Failure Analysis')),
  pcb_id UUID REFERENCES pcb_master(id),
  inspection_date DATE NOT NULL DEFAULT CURRENT_DATE,
  inspection_status TEXT NOT NULL CHECK (inspection_status IN ('OK', 'Not OK')),
  inspection_remarks TEXT,
  ate_data JSONB DEFAULT '{}',
  ate_report_path TEXT,
  shift TEXT,
  test_remarks TEXT,
  observations TEXT,
  tested_by UUID REFERENCES users(id),
  status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  rejection_remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- E-Cell Tracking records
CREATE TABLE tracking_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_record_id UUID REFERENCES test_records(id),
  pcb_name TEXT NOT NULL,
  part_code TEXT REFERENCES price_master(part_code),
  price DECIMAL(15,2),
  quantity INTEGER DEFAULT 1,
  final_price DECIMAL(15,2),
  months INTEGER,
  financial_year TEXT,
  machine TEXT,
  drive_name TEXT,
  ffa_claim_ifa_sno TEXT,
  field_line_observation TEXT,
  e_cell_observation TEXT,
  status TEXT CHECK (status IN ('OK', 'Not OK')),
  test_conducted_by TEXT,
  report_status TEXT DEFAULT 'Pending',
  report_name TEXT,
  handover_date DATE,
  final_handover_person TEXT,
  final_handover_location TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Change logs for tracking record updates
CREATE TABLE tracking_change_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tracking_record_id UUID REFERENCES tracking_records(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES users(id),
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Knowledge base for troubleshooting
CREATE TABLE knowledge_base (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_record_id UUID REFERENCES test_records(id),
  problem_description TEXT NOT NULL,
  resolution_path TEXT,
  keywords TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions table for login tracking
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL,
  logged_in_at TIMESTAMPTZ DEFAULT NOW(),
  logged_out_at TIMESTAMPTZ,
  ip_address TEXT
);

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pcb_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_change_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users
CREATE POLICY "select_users" ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_users" ON users FOR INSERT TO authenticated WITH CHECK (auth.uid() = id OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "update_users" ON users FOR UPDATE TO authenticated USING (auth.uid() = id OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')) WITH CHECK (auth.uid() = id OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- RLS Policies for audit_logs (admin only)
CREATE POLICY "select_audit_logs" ON audit_logs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "insert_audit_logs" ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- RLS Policies for pcb_master
CREATE POLICY "select_pcb_master" ON pcb_master FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_pcb_master" ON pcb_master FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "update_pcb_master" ON pcb_master FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- RLS Policies for price_master
CREATE POLICY "select_price_master" ON price_master FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_price_master" ON price_master FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_price_master" ON price_master FOR UPDATE TO authenticated USING (true);
CREATE POLICY "delete_price_master" ON price_master FOR DELETE TO authenticated USING (true);

-- RLS Policies for test_records
CREATE POLICY "select_test_records" ON test_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_test_records" ON test_records FOR INSERT TO authenticated WITH CHECK (auth.uid() = tested_by OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "update_test_records" ON test_records FOR UPDATE TO authenticated USING (auth.uid() = tested_by OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'approver'))) WITH CHECK (true);

-- RLS Policies for tracking_records
CREATE POLICY "select_tracking_records" ON tracking_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_tracking_records" ON tracking_records FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "update_tracking_records" ON tracking_records FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_tracking_records" ON tracking_records FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- RLS Policies for tracking_change_logs
CREATE POLICY "select_tracking_change_logs" ON tracking_change_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_tracking_change_logs" ON tracking_change_logs FOR INSERT TO authenticated WITH CHECK (true);

-- RLS Policies for knowledge_base
CREATE POLICY "select_knowledge_base" ON knowledge_base FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_knowledge_base" ON knowledge_base FOR INSERT TO authenticated WITH CHECK (true);

-- RLS Policies for user_sessions
CREATE POLICY "select_own_sessions" ON user_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_sessions" ON user_sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_sessions" ON user_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_test_records_barcode ON test_records(barcode);
CREATE INDEX idx_test_records_status ON test_records(status);
CREATE INDEX idx_test_records_created_at ON test_records(created_at DESC);
CREATE INDEX idx_tracking_records_part_code ON tracking_records(part_code);
CREATE INDEX idx_tracking_records_status ON tracking_records(status);
CREATE INDEX idx_tracking_records_created_at ON tracking_records(created_at DESC);
CREATE INDEX idx_price_master_part_code ON price_master(part_code);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);