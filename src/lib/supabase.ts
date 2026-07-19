import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabaseConfigError = !isSupabaseConfigured
  ? 'Supabase environment variables are missing. Please configure: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY'
  : null;

// When env vars are missing we still create a client with placeholder values
// so that importing this module does not throw at load time (which would
// produce a blank white screen). The app gates rendering on
// `isSupabaseConfigured` and shows a configuration error screen instead.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
);

export type UserRole = 'admin' | 'ecell' | 'auditor';

export type User = {
  id: string;
  user_id: string | null;
  username: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  department: string | null;
  mobile: string | null;
  profile_photo: string | null;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
};

export type AuditLog = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
};

export type PcbMaster = {
  id: string;
  pcb_name: string;
  drive_name: string | null;
  description: string | null;
  created_at: string;
};

export type PriceMaster = {
  id: string;
  part_code: string;
  price: number;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InspectionStatus = 'OK' | 'Not OK' | 'Under Analysis';
export type ReportStatus = 'Pending' | 'Approval' | 'In Process' | 'Rejected';

export type CustomField = {
  id: string;
  label: string;
  type: 'text' | 'checkbox';
  value: string | boolean;
};

export type TestRecord = {
  id: string;
  barcode: string;
  failure_type: 'Line Failure Analysis' | 'Field Failure Analysis' | null;
  pcb_id: string | null;
  inspection_date: string;
  inspection_status: InspectionStatus;
  inspection_remarks: string | null;
  ate_data: Record<string, unknown>;
  ate_report_path: string | null;
  shift: string | null;
  test_remarks: string | null;
  observations: string | null;
  tested_by: string | null;
  status: ReportStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_remarks: string | null;
  station_id: string | null;
  operator_name: string | null;
  expected_result: string | null;
  actual_result: string | null;
  before_photo_url: string | null;
  after_photo_url: string | null;
  custom_fields: CustomField[];
  created_at: string;
  updated_at: string;
  pcb_master?: PcbMaster;
  tester?: User;
  approver?: User;
};

export type TrackingRecord = {
  id: string;
  test_record_id: string | null;
  pcb_name: string;
  part_code: string | null;
  price: number | null;
  quantity: number;
  final_price: number | null;
  months: number | null;
  financial_year: string | null;
  machine: string | null;
  drive_name: string | null;
  ffa_claim_ifa_sno: string | null;
  field_line_observation: string | null;
  e_cell_observation: string | null;
  status: InspectionStatus | null;
  test_conducted_by: string | null;
  report_status: string;
  report_name: string | null;
  handover_date: string | null;
  final_handover_person: string | null;
  final_handover_location: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  test_record?: TestRecord;
};

export type TroubleshootingLog = {
  id: string;
  line_dept: string;
  issue: string;
  root_cause: string | null;
  corrective_action: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SavingsProject = {
  id: string;
  project_name: string;
  description: string | null;
  monthly_savings: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RcaCostMetric = {
  id: string;
  pcb_name: string;
  part_code: string;
  cost_per_pcb: number;
  month_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type KnowledgeBase = {
  id: string;
  test_record_id: string | null;
  problem_description: string;
  resolution_path: string | null;
  keywords: string[];
  created_at: string;
};
