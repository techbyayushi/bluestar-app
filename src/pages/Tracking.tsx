import { useState, useEffect, useRef } from 'react';
import { supabase, PriceMaster, TrackingRecord, InspectionStatus } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { formatINR } from '../lib/utils';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Save,
  Plus,
  Search,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Eye,
  Pencil,
} from 'lucide-react';
import { format } from 'date-fns';

export function Tracking() {
  const { user, logAudit } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [priceMaster, setPriceMaster] = useState<PriceMaster[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null);

  const [records, setRecords] = useState<TrackingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | string>('all');
  const [reportStatusFilter, setReportStatusFilter] = useState<'all' | string>('all');
  const [machineFilter, setMachineFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<TrackingRecord | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    pcb_name: '',
    part_code: '',
    quantity: 1,
    months: 1,
    machine: '',
    drive_name: '',
    field_line_observation: '',
    e_cell_observation: '',
    status: 'Under Analysis' as InspectionStatus,
    test_conducted_by: user?.full_name || '',
    final_handover_person: '',
    final_handover_location: '',
    handover_date: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [trackRes, priceRes] = await Promise.all([
      supabase.from('tracking_records').select('*').order('created_at', { ascending: false }),
      supabase.from('price_master').select('*').order('part_code'),
    ]);
    if (trackRes.data) setRecords(trackRes.data as TrackingRecord[]);
    if (priceRes.data) setPriceMaster(priceRes.data as PriceMaster[]);
    setLoading(false);
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);

    try {
      const data = await file.arrayBuffer();
      let workbook;
      try {
        workbook = XLSX.read(data, { type: 'array' });
      } catch (e) {
        // fallback: try reading as text (CSV or similar)
        const text = await file.text();
        workbook = XLSX.read(text, { type: 'string' });
      }
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      // detect whether sheet looks like tracking entries (contains pcb_name) or price master
      const firstRow = rows[0] || {};
      const keys = Object.keys(firstRow).map(k => k.toString().toLowerCase());

      if (keys.includes('pcb_name') || keys.includes('pcb name') || keys.includes('pcb')) {
        // Insert tracking records - normalize headers and parse values robustly
        const normalize = (s: string) => s.replace(/\s|_|\-/g, '').toLowerCase();

        const parseNumber = (v: unknown) => {
          if (v === null || v === undefined || v === '') return NaN;
          if (typeof v === 'number') return v as number;
          const n = parseFloat(String(v).toString().replace(/[^0-9.\-]/g, ''));
          return isNaN(n) ? NaN : n;
        };

        const parseExcelDate = (v: unknown) => {
          if (v === null || v === undefined || v === '') return null;
          if (typeof v === 'number') {
            // Excel serial date
            try {
              const dc = (XLSX as any).SSF.parse_date_code(v);
              if (dc && dc.y) {
                const d = new Date(Date.UTC(dc.y, dc.m - 1, dc.d, dc.H || 0, dc.M || 0, dc.S || 0));
                return d.toISOString();
              }
            } catch (e) {
              // fallthrough
            }
            return null;
          }
          const s = String(v);
          const d = new Date(s);
          return isNaN(d.getTime()) ? null : d.toISOString();
        };

        let sanitizedCount = 0;
        const normalizeStatus = (v: unknown) => {
          if (v === null || v === undefined) return null;
          const s = String(v).trim();
          if (!s) return null;
          const l = s.toLowerCase();
          if (/^ok$/.test(l) || (l.includes('ok') && !l.includes('not'))) return 'OK';
          if (l.includes('not') && l.includes('ok')) return 'Not OK';
          if (l.includes('under') && l.includes('analysi')) return 'Under Analysis';
          // common short forms
          if (l === 'notok' || l === 'not_ok') return 'Not OK';
          if (l === 'underanalysis' || l === 'under_analysis') return 'Under Analysis';
          return null;
        };

        const entries = rows
          .map(row => {
            const map: Record<string, unknown> = {};
            Object.keys(row).forEach(k => {
              map[normalize(String(k))] = row[k as keyof typeof row];
            });

            const pcb_name = String(map['pcbname'] || map['pcb_name'] || map['pcb'] || '').trim();
            const part_code = ((map['partcode'] || map['part_code'] || map['part'] || map['partcode']) || '') as string;
            const qtyRaw = map['qty'] ?? map['quantity'] ?? map['quantity'];
            const parsedQty = parseNumber(qtyRaw);
            const quantity = Number.isNaN(parsedQty) ? 1 : Math.max(1, parseInt(String(parsedQty)) || 1);
            const priceRaw = map['price'] ?? map['unitprice'] ?? map['amount'];
            const price = Number.isNaN(parseNumber(priceRaw)) ? 0 : parseNumber(priceRaw);
            const totalRaw = map['total'] ?? map['final_price'] ?? map['finalprice'];
            const final_price = !Number.isNaN(parseNumber(totalRaw)) ? parseNumber(totalRaw) : price * (quantity || 0);
            const months = parseInt(String(map['months'] || '1')) || 1;
            const machine = String(map['machine'] || '');
            const drive_name = String(map['drivename'] || map['drivename'] || map['drive'] || '');
            const field_line_observation = String(map['fieldlineobservation'] || map['fieldobservation'] || '');
            const e_cell_observation = String(map['ecellobservation'] || map['ecellobservation'] || '');
            const statusRaw = map['status'] ?? '';
            const mappedStatus = normalizeStatus(statusRaw);
            const status = mappedStatus;
            if ((statusRaw || '') && !mappedStatus) sanitizedCount += 1;
            const test_conducted_by = String(map['testby'] || map['test_conducted_by'] || map['testedby'] || user?.full_name || '');
            const final_handover_person = String(map['finalhandoverperson'] || '');
            const final_handover_location = String(map['finalhandoverlocation'] || '');
            const dateRaw = map['date'] || map['createdat'] || map['created_at'] || map['handoverdate'] || map['handover_date'];
            const created_at = parseExcelDate(dateRaw);

            return pcb_name
              ? {
                  pcb_name,
                  part_code: (part_code || null) as string | null,
                  price: price || 0,
                  quantity: quantity || 0,
                  final_price: final_price || 0,
                  months: months || 1,
                  machine: machine || null,
                  drive_name: drive_name || null,
                  field_line_observation: field_line_observation || null,
                  e_cell_observation: e_cell_observation || null,
                  status: (status as InspectionStatus) || null,
                  test_conducted_by: test_conducted_by || null,
                  final_handover_person: final_handover_person || null,
                  final_handover_location: final_handover_location || null,
                  handover_date: created_at,
                  created_at: created_at || undefined,
                  created_by: user?.id,
                }
              : null;
          })
          .filter(Boolean) as any[];

        if (entries.length === 0) {
          setUploadResult({ success: false, message: 'No valid tracking rows found. Expected column: pcb_name' });
          return;
        }

        // De-duplicate: check existing rows and skip inserts for exact matches
        const toInsert: any[] = [];
        const duplicates: any[] = [];
        for (const ent of entries) {
          const matchObj: Record<string, unknown> = {
            pcb_name: ent.pcb_name,
            part_code: ent.part_code,
            final_price: ent.final_price,
          };
          if (ent.created_at) matchObj.created_at = ent.created_at;

          const { data: existing, error: qerr } = await supabase.from('tracking_records').select('id').match(matchObj).limit(1) as any;
          if (qerr) throw qerr;
          if (existing && existing.length > 0) duplicates.push(ent);
          else toInsert.push(ent);
        }

        if (toInsert.length === 0) {
          setUploadResult({ success: false, message: `No new rows to import — ${duplicates.length} duplicate row(s) already exist.` });
          return;
        }

        const { error } = await supabase.from('tracking_records').insert(toInsert).select();
        if (error) throw error;
        setUploadResult({
          success: true,
          message: `Imported ${toInsert.length} tracking entr${toInsert.length === 1 ? 'y' : 'ies'}${sanitizedCount ? ` (sanitized ${sanitizedCount} invalid status values)` : ''}${duplicates.length ? ` — skipped ${duplicates.length} duplicate row(s)` : ''}`,
        });
        await logAudit('TRACKING_RECORDS_UPLOADED', 'tracking_records', undefined, { imported: toInsert.length, skipped_duplicates: duplicates.length });
        fetchData();
      } else {
        // Fallback to price master upload (existing behavior)
        const entries = rows
          .map(row => {
            const partCode = String(row['part_code'] || row['Part Code'] || row['partcode'] || '').trim();
            const price = parseFloat(String(row['price'] || row['Price'] || '0'));
            return { part_code: partCode, price: isNaN(price) ? 0 : price };
          })
          .filter(r => r.part_code);

        if (entries.length === 0) {
          setUploadResult({ success: false, message: 'No valid rows found. Expected columns: part_code, price' });
          return;
        }

        const { error } = await supabase.from('price_master').upsert(entries, { onConflict: 'part_code' });
        if (error) throw error;
        setUploadResult({ success: true, message: `Uploaded ${entries.length} price entries` });
        await logAudit('PRICE_MASTER_UPLOADED', 'price_master', undefined, { count: entries.length });
        fetchData();
      }
    } catch (err: any) {
      console.error('Excel upload error:', err);
      const msg = err?.message || String(err) || 'Failed to upload. Check file format.';
      setUploadResult({ success: false, message: `Failed to upload: ${msg}` });
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      pcb_name: '',
      part_code: '',
      quantity: 1,
      months: 1,
      machine: '',
      drive_name: '',
      field_line_observation: '',
      e_cell_observation: '',
      status: 'Under Analysis',
      test_conducted_by: user?.full_name || '',
      final_handover_person: '',
      final_handover_location: '',
      handover_date: '',
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!formData.pcb_name.trim()) return;
    setSaving(true);

    try {
      const selectedPrice = priceMaster.find(p => p.part_code === formData.part_code);
      const price = selectedPrice?.price || 0;
      const finalPrice = price * formData.quantity;

      const payload = {
        pcb_name: formData.pcb_name,
        part_code: formData.part_code || null,
        price,
        quantity: formData.quantity,
        final_price: finalPrice,
        months: formData.months,
        machine: formData.machine,
        drive_name: formData.drive_name,
        field_line_observation: formData.field_line_observation,
        e_cell_observation: formData.e_cell_observation,
        status: formData.status,
        test_conducted_by: formData.test_conducted_by,
        final_handover_person: formData.final_handover_person,
        final_handover_location: formData.final_handover_location,
        handover_date: formData.handover_date || null,
        created_by: user?.id,
      };

      if (editingId) {
        const { error } = await supabase.from('tracking_records').update(payload).eq('id', editingId);
        if (error) throw error;
        await logAudit('TRACKING_RECORD_UPDATED', 'tracking_records', editingId, { pcb_name: formData.pcb_name });
      } else {
        const { data, error } = await supabase.from('tracking_records').insert(payload).select().single();
        if (error) throw error;
        await logAudit('TRACKING_RECORD_CREATED', 'tracking_records', data.id, { pcb_name: formData.pcb_name });
      }

      resetForm();
      fetchData();
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (record: TrackingRecord) => {
    setEditingId(record.id);
    setFormData({
      pcb_name: record.pcb_name,
      part_code: record.part_code || '',
      quantity: record.quantity,
      months: record.months || 1,
      machine: record.machine || '',
      drive_name: record.drive_name || '',
      field_line_observation: record.field_line_observation || '',
      e_cell_observation: record.e_cell_observation || '',
      status: record.status || 'Under Analysis',
      test_conducted_by: record.test_conducted_by || user?.full_name || '',
      final_handover_person: record.final_handover_person || '',
      final_handover_location: record.final_handover_location || '',
      handover_date: record.handover_date ? format(new Date(record.handover_date), 'yyyy-MM-dd') : '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this tracking record?')) return;
    const { error } = await supabase.from('tracking_records').delete().eq('id', id);
    if (!error) {
      await logAudit('TRACKING_RECORD_DELETED', 'tracking_records', id, {});
      if (selectedRecord?.id === id) {
        setSelectedRecord(null);
      }
      fetchData();
    }
  };

  const openRecordDetails = (record: TrackingRecord) => {
    setSelectedRecord(record);
  };

  const closeRecordDetails = () => {
    setSelectedRecord(null);
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredRecords = records.filter(r => {
    const matchesSearch = !normalizedSearch || [r.pcb_name, r.part_code, r.machine, r.drive_name, r.test_conducted_by]
      .some(value => (value || '').toLowerCase().includes(normalizedSearch));

    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchesReportStatus = reportStatusFilter === 'all' || (r.report_status || 'Pending') === reportStatusFilter;
    const matchesMachine = machineFilter === 'all' || (r.machine || '').toLowerCase() === machineFilter.toLowerCase();

    const recordDate = r.created_at ? new Date(r.created_at) : null;
    const fromOk = !dateFrom || (recordDate ? recordDate >= new Date(dateFrom) : false);
    const toOk = !dateTo || (recordDate ? recordDate <= new Date(`${dateTo}T23:59:59`) : false);

    return matchesSearch && matchesStatus && matchesReportStatus && matchesMachine && fromOk && toOk;
  });

  const totalPrice = filteredRecords.reduce((sum, r) => sum + Number(r.final_price || 0), 0);
  const statusOptions = Array.from(new Set(records.map(r => r.status).filter(Boolean))) as string[];
  const reportStatusOptions = Array.from(new Set(records.map(r => r.report_status || 'Pending')));
  const machineOptions = Array.from(new Set(records.map(r => r.machine).filter(Boolean))) as string[];

  const resetFilters = () => {
    setStatusFilter('all');
    setReportStatusFilter('all');
    setMachineFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const inputClass =
    'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-500';
  const actionButtonClass =
    'inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-1';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4 rounded-2xl border border-slate-200 bg-white/80 px-4 py-4 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">E-Cell Track</h1>
          <p className="text-sm text-slate-500 mt-1">Track PCB repair costs and handover status</p>
        </div>
        <div className="flex gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                    Upload Excel
                  </button>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelUpload} />
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add Entry
          </button>
        </div>
      </div>

      {uploadResult && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm animate-fade-in ${
          uploadResult.success ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-600'
        }`}>
          {uploadResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {uploadResult.message}
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-slate-800">{editingId ? 'Edit Entry' : 'New Tracking Entry'}</h2>
            <button onClick={resetForm} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">PCB Name *</label>
              <input type="text" value={formData.pcb_name} onChange={e => setFormData({ ...formData, pcb_name: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Part Code</label>
              <select value={formData.part_code} onChange={e => setFormData({ ...formData, part_code: e.target.value })} className={inputClass}>
                <option value="">Select part code</option>
                {priceMaster.map(p => <option key={p.id} value={p.part_code}>{p.part_code} (₹{p.price})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Quantity</label>
              <input type="number" min="1" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Months</label>
              <input type="number" min="1" value={formData.months} onChange={e => setFormData({ ...formData, months: parseInt(e.target.value) || 1 })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Machine</label>
              <input type="text" value={formData.machine} onChange={e => setFormData({ ...formData, machine: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Drive Name</label>
              <input type="text" value={formData.drive_name} onChange={e => setFormData({ ...formData, drive_name: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
              <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as InspectionStatus })} className={inputClass}>
                <option value="Under Analysis">Under Analysis</option>
                <option value="OK">OK</option>
                <option value="Not OK">Not OK</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Test Conducted By</label>
              <input type="text" value={formData.test_conducted_by} onChange={e => setFormData({ ...formData, test_conducted_by: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Handover Date</label>
              <input type="date" value={formData.handover_date} onChange={e => setFormData({ ...formData, handover_date: e.target.value })} className={inputClass} />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Field/Line Observation</label>
              <textarea value={formData.field_line_observation} onChange={e => setFormData({ ...formData, field_line_observation: e.target.value })} rows={2} className={inputClass} />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">E-Cell Observation</label>
              <textarea value={formData.e_cell_observation} onChange={e => setFormData({ ...formData, e_cell_observation: e.target.value })} rows={2} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Final Handover Person</label>
              <input type="text" value={formData.final_handover_person} onChange={e => setFormData({ ...formData, final_handover_person: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Handover Location</label>
              <input type="text" value={formData.final_handover_location} onChange={e => setFormData({ ...formData, final_handover_location: e.target.value })} className={inputClass} />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-5">
            <button onClick={resetForm} className="px-5 py-2 text-slate-600 font-medium hover:text-slate-800">Cancel</button>
            <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 px-6 py-2 bg-accent-600 text-white rounded-lg font-medium hover:bg-accent-700 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search by PCB, part code, machine..." className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500" />
          </div>
          <button
            onClick={resetFilters}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
          >
            Reset Filters
          </button>
          <div className="ml-auto text-sm text-slate-500">
            Total Value: <span className="font-semibold text-emerald-600">{formatINR(totalPrice)}</span>
          </div>
        </div>

        <div className="border-b border-slate-100 bg-slate-50/80 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[160px] flex-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Status</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent-500">
                <option value="all">All</option>
                {statusOptions.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[180px] flex-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Report Status</label>
              <select value={reportStatusFilter} onChange={e => setReportStatusFilter(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent-500">
                <option value="all">All</option>
                {reportStatusOptions.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[180px] flex-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Machine</label>
              <select value={machineFilter} onChange={e => setMachineFilter(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent-500">
                <option value="all">All</option>
                {machineOptions.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['SR No', 'PCB/Drive Name', 'Part Code', 'Machine Details', 'Status', 'Report Status', 'Actions'].map((h, index) => (
                  <th
                    key={h}
                    className={`px-3 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide ${index === 0 ? 'w-14' : ''} ${index === 1 ? 'min-w-[240px]' : ''} ${index === 3 ? 'min-w-[190px]' : ''} ${index === 4 ? 'w-[150px]' : ''} ${index === 5 ? 'w-[150px]' : ''} ${index === 6 ? 'w-24 text-center' : ''}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center"><Loader2 className="w-6 h-6 text-accent-500 animate-spin mx-auto" /></td></tr>
              ) : filteredRecords.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">No tracking records found</td></tr>
              ) : (
                filteredRecords.map((r, index) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer transition-all duration-200 hover:bg-slate-50 hover:shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)]"
                    onClick={() => openRecordDetails(r)}
                  >
                    <td className="w-14 px-3 py-3 text-sm font-medium text-slate-700">{index + 1}</td>
                    <td className="min-w-[240px] px-3 py-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-700">{r.pcb_name}</span>
                        {r.drive_name && <span className="text-xs text-slate-400">{r.drive_name}</span>}
                      </div>
                    </td>
                    <td className="min-w-[120px] px-3 py-3 text-sm text-slate-600 font-mono">{r.part_code || '-'}</td>
                    <td className="min-w-[190px] px-3 py-3 text-sm text-slate-600">{r.machine || '-'}</td>
                    <td className="w-[150px] px-3 py-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="w-[150px] px-3 py-3">
                      <span className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                        {r.report_status || 'Pending'}
                      </span>
                    </td>
                    <td className="w-24 px-2 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1 sm:gap-2">
                        <button
                          type="button"
                          onClick={() => openRecordDetails(r)}
                          aria-label="View Details"
                          title="View Details"
                          className={`${actionButtonClass} hover:bg-sky-50 hover:text-sky-600`}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEdit(r)}
                          aria-label="Edit Record"
                          title="Edit Record"
                          className={`${actionButtonClass} hover:bg-amber-50 hover:text-amber-600`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(r.id)}
                          aria-label="Delete Record"
                          title="Delete Record"
                          className={`${actionButtonClass} border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`fixed inset-y-0 right-0 z-30 w-full max-w-[40vw] min-w-[340px] border-l border-slate-200 bg-white shadow-2xl transition-all duration-300 ease-out ${selectedRecord ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">E-Cell Record</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-800">{selectedRecord?.pcb_name || 'Record Details'}</h2>
            </div>
            <button onClick={closeRecordDetails} className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          {selectedRecord ? (
            <div className="flex-1 overflow-y-auto p-5">
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-500">PCB / Drive Name</p>
                      <p className="mt-1 text-lg font-semibold text-slate-800">{selectedRecord.pcb_name}</p>
                      {selectedRecord.drive_name && <p className="mt-1 text-sm text-slate-500">{selectedRecord.drive_name}</p>}
                    </div>
                    <StatusPill status={selectedRecord.status} />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Basic Information</h3>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <DetailItem label="Received Date" value={format(new Date(selectedRecord.created_at), 'MMM d, yyyy')} />
                    <DetailItem label="Received From" value={selectedRecord.test_conducted_by || '-'} />
                    <DetailItem label="FFA / IFA" value={selectedRecord.part_code || '-'} />
                    <DetailItem label="Machine Details" value={selectedRecord.machine || '-'} />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">PCB Information</h3>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <DetailItem label="PCB Name" value={selectedRecord.pcb_name} />
                    <DetailItem label="Part Code" value={selectedRecord.part_code || '-'} />
                    <DetailItem label="FFA Claim Number / IFA Serial Number" value={selectedRecord.final_handover_person || '-'} />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Observations</h3>
                  <div className="mt-3 space-y-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Field / Line Observation</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selectedRecord.field_line_observation || 'No observation provided.'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">E-Cell Observation</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selectedRecord.e_cell_observation || 'No observation provided.'}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Report & Handover</h3>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <DetailItem label="Status" value={selectedRecord.status || '-'} isBadge />
                    <DetailItem label="Test Conducted By" value={selectedRecord.test_conducted_by || '-'} />
                    <DetailItem label="Report Status" value={selectedRecord.report_status || 'Pending'} isBadge />
                    <DetailItem label="RCA Report Name" value={selectedRecord.pcb_name} />
                    <DetailItem label="Handover Date" value={selectedRecord.handover_date ? format(new Date(selectedRecord.handover_date), 'MMM d, yyyy') : '-'} />
                    <DetailItem label="Final Handover Person" value={selectedRecord.final_handover_person || '-'} />
                    <DetailItem label="Final Handover Location" value={selectedRecord.final_handover_location || '-'} />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value, isBadge = false }: { label: string; value: string; isBadge?: boolean }) {
  const badgeStyles: Record<string, string> = {
    'Completed': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'In Progress': 'bg-amber-50 text-amber-700 border-amber-200',
    'Pending': 'bg-rose-50 text-rose-700 border-rose-200',
    'Testing': 'bg-sky-50 text-sky-700 border-sky-200',
    'In Process': 'bg-amber-50 text-amber-700 border-amber-200',
    'Approved': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'Rejected': 'bg-rose-50 text-rose-700 border-rose-200',
  };

  const normalizedValue = value || '-';
  const badgeClass = isBadge ? badgeStyles[normalizedValue] || 'bg-slate-50 text-slate-700 border-slate-200' : '';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      {isBadge ? (
        <div className={`mt-1 inline-flex items-center rounded-full border px-2.5 py-1 text-sm font-medium ${badgeClass}`}>
          {normalizedValue}
        </div>
      ) : (
        <p className="mt-1 text-sm font-medium text-slate-700">{normalizedValue}</p>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string | null }) {
  const styles: Record<string, string> = {
    'OK': 'bg-emerald-50 text-emerald-600 border-emerald-200',
    'Not OK': 'bg-red-50 text-red-600 border-red-200',
    'Under Analysis': 'bg-amber-50 text-amber-600 border-amber-200',
  };
  return (
    <span className={`inline-flex items-center justify-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status || ''] || styles['Under Analysis']}`}>
      {status || 'Pending'}
    </span>
  );
}
