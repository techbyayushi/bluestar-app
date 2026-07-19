-- Add email column to users table if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

-- Insert some demo PCB master data
INSERT INTO pcb_master (pcb_name, drive_name, description) VALUES
  ('PCB-001-A', 'DRV-001', 'Main control board'),
  ('PCB-002-B', 'DRV-002', 'Power supply board'),
  ('PCB-003-C', 'DRV-003', 'Sensor interface board'),
  ('PCB-004-D', 'DRV-004', 'Communication module'),
  ('PCB-005-E', 'DRV-005', 'Motor driver board')
ON CONFLICT (pcb_name) DO NOTHING;

-- Insert some demo price master data
INSERT INTO price_master (part_code, price) VALUES
  ('CAP-001', 15.50),
  ('CAP-002', 22.75),
  ('RES-001', 5.25),
  ('RES-002', 8.00),
  ('IC-001', 125.00),
  ('IC-002', 89.50),
  ('IC-003', 156.00),
  ('CONN-001', 35.00),
  ('CONN-002', 42.50),
  ('TRANS-001', 78.00),
  ('DIODE-001', 12.50),
  ('LED-001', 8.75)
ON CONFLICT (part_code) DO NOTHING;
