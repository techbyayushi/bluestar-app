import { useState, useEffect, useRef } from 'react';
import { supabase, TroubleshootingLog } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Plus,
  Save,
  Upload,
  FileText,
  Search,
  X,
  Loader2,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { format } from 'date-fns';

const LINE_DEPT_OPTIONS = ['F-3', 'IQA', 'G-3', 'G-0 Setup-3', 'F-2', 'G-0 Setup-1', 'G-0 Setup-2', 'EOL'];

export function Troubleshooting() {
  const { user, logAudit } = useAuth();
  const importInputRef = useRef<HTMLInputElement>(null);

  const [logs, setLogs] = useState<TroubleshootingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [lineFilter, setLineFilter] = useState('all');
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    line_dept: '',
    issue: '',
    root_cause: '',
    corrective_action: '',
  });

  const canEdit = user?.role === 'admin' || user?.role === 'ecell';

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('troubleshooting_logs')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setLogs(data as TroubleshootingLog[]);
    setLoading(false);
  };

  const resetForm = () => {
    setFormData({ line_dept: '', issue: '', root_cause: '', corrective_action: '' });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!formData.line_dept || !formData.issue.trim()) return;
    setSaving(true);

    try {
      if (editingId) {
        const { error } = await supabase
          .from('troubleshooting_logs')
          .update({ ...formData, updated_at: new Date().toISOString() })
          .eq('id', editingId);
        if (error) throw error;
        await logAudit('TROUBLESHOOTING_UPDATED', 'troubleshooting_logs', editingId, {});
      } else {
        const { data, error } = await supabase
          .from('troubleshooting_logs')
          .insert({ ...formData, created_by: user?.id })
          .select()
          .single();
        if (error) throw error;
        await logAudit('TROUBLESHOOTING_CREATED', 'troubleshooting_logs', data.id, {});
      }
      resetForm();
      fetchLogs();
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (log: TroubleshootingLog) => {
    setEditingId(log.id);
    setFormData({
      line_dept: log.line_dept,
      issue: log.issue,
      root_cause: log.root_cause || '',
      corrective_action: log.corrective_action || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this troubleshooting log?')) return;
    const { error } = await supabase.from('troubleshooting_logs').delete().eq('id', id);
    if (!error) {
      await logAudit('TROUBLESHOOTING_DELETED', 'troubleshooting_logs', id, {});
      fetchLogs();
    }
  };

  // Excel Import
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

      const entries = rows
        .map(row => ({
          line_dept: String(row['line_dept'] || row['Line/Dept'] || row['Line'] || '').trim(),
          issue: String(row['issue'] || row['Issue'] || '').trim(),
          root_cause: String(row['root_cause'] || row['Root Cause'] || '').trim() || null,
          corrective_action: String(row['corrective_action'] || row['Corrective Action'] || '').trim() || null,
          created_by: user?.id,
        }))
        .filter(r => r.line_dept && r.issue);

      if (entries.length === 0) {
        setImportResult({ success: false, message: 'No valid rows. Expected: line_dept, issue, root_cause, corrective_action' });
        return;
      }

      const existingLogsRes = await supabase.from('troubleshooting_logs').select('line_dept,issue');
      const existingLogs = (existingLogsRes.data as { line_dept: string; issue: string }[]) || [];
      const existingKeys = new Set(existingLogs.map(log => `${log.line_dept.trim().toLowerCase()}::${log.issue.trim().toLowerCase()}`));

      const newEntries = entries.filter(entry => {
        const key = `${entry.line_dept.trim().toLowerCase()}::${entry.issue.trim().toLowerCase()}`;
        return !existingKeys.has(key);
      });
      const duplicateCount = entries.length - newEntries.length;

      if (newEntries.length === 0) {
        setImportResult({ success: false, message: `No new logs imported. ${duplicateCount} duplicate row(s) already exist.` });
        return;
      }

      const { error } = await supabase.from('troubleshooting_logs').insert(newEntries);
      if (error) throw error;

      setImportResult({
        success: true,
        message: `Imported ${newEntries.length} log(s) successfully${duplicateCount ? `; skipped ${duplicateCount} duplicate row(s)` : ''}`,
      });
      await logAudit('TROUBLESHOOTING_IMPORTED', 'troubleshooting_logs', undefined, { imported: newEntries.length, skipped_duplicates: duplicateCount });
      fetchLogs();
    } catch {
      setImportResult({ success: false, message: 'Import failed. Check file format.' });
    }
  };

  // Excel Export
  const handleExportExcel = () => {
    const data = filteredLogs.map((log, idx) => ({
      'Sr. No.': idx + 1,
      'Line/Dept': log.line_dept,
      'Issue': log.issue,
      'Root Cause': log.root_cause || '',
      'Corrective Action': log.corrective_action || '',
      'Created Date': format(new Date(log.created_at), 'yyyy-MM-dd'),
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Troubleshooting Logs');
    XLSX.writeFile(wb, `Troubleshooting_Logs_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    logAudit('TROUBLESHOOTING_EXPORTED_EXCEL', 'troubleshooting_logs', undefined, { count: data.length });
  };

  // PDF Export
  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(16);
    doc.setTextColor(30, 64, 175);
    doc.text('Troubleshooting Report Log', 14, 15);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}`, 14, 21);
    doc.text(`Total Records: ${filteredLogs.length}`, 14, 26);

    autoTable(doc, {
      startY: 32,
      head: [['Sr. No.', 'Line/Dept', 'Issue', 'Root Cause', 'Corrective Action']],
      body: filteredLogs.map((log, idx) => [
        idx + 1,
        log.line_dept,
        log.issue,
        log.root_cause || '-',
        log.corrective_action || '-',
      ]),
      headStyles: {
        fillColor: [30, 64, 175],
        textColor: 255,
        fontSize: 9,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [51, 51, 51],
      },
      alternateRowStyles: {
        fillColor: [241, 245, 249],
      },
      styles: {
        cellPadding: 3,
        lineColor: [203, 213, 225],
        lineWidth: 0.1,
      },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 25 },
        2: { cellWidth: 60 },
        3: { cellWidth: 60 },
        4: { cellWidth: 80 },
      },
    });

    doc.save(`Troubleshooting_Report_${format(new Date(), 'yyyyMMdd')}.pdf`);
    logAudit('TROUBLESHOOTING_EXPORTED_PDF', 'troubleshooting_logs', undefined, { count: filteredLogs.length });
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch =
      log.issue?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.root_cause?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.corrective_action?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLine = lineFilter === 'all' || log.line_dept === lineFilter;
    return matchesSearch && matchesLine;
  });

  const inputClass =
    'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-500';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Troubleshooting Track</h1>
          <p className="text-sm text-slate-500 mt-1">Data entry & report log for production line issues</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canEdit && (
            <>
              <button
                onClick={() => importInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                <Upload className="w-4 h-4" /> Import Excel
              </button>
              <input ref={importInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
              <button
                onClick={() => { resetForm(); setShowForm(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" /> New Entry
              </button>
            </>
          )}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
          >
            <FileText className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {importResult && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm animate-fade-in ${
          importResult.success ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-600'
        }`}>
          {importResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {importResult.message}
          <button onClick={() => setImportResult(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-slate-800">{editingId ? 'Edit Entry' : 'New Troubleshooting Entry'}</h2>
            <button onClick={resetForm} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Line / Dept *</label>
              <select value={formData.line_dept} onChange={e => setFormData({ ...formData, line_dept: e.target.value })} className={inputClass}>
                <option value="">Select line/dept</option>
                {LINE_DEPT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div />
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Issue *</label>
              <textarea value={formData.issue} onChange={e => setFormData({ ...formData, issue: e.target.value })} rows={3} placeholder="Describe the failure symptoms in detail..." className={inputClass} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Root Cause</label>
              <textarea value={formData.root_cause} onChange={e => setFormData({ ...formData, root_cause: e.target.value })} rows={3} placeholder="Technical analysis and root cause breakdown..." className={inputClass} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Corrective Action</label>
              <textarea value={formData.corrective_action} onChange={e => setFormData({ ...formData, corrective_action: e.target.value })} rows={4} placeholder="Numbered or bulleted resolution steps..." className={inputClass} />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-5">
            <button onClick={resetForm} className="px-5 py-2 text-slate-600 font-medium hover:text-slate-800">Cancel</button>
            <button onClick={handleSubmit} disabled={saving || !formData.line_dept || !formData.issue.trim()} className="flex items-center gap-2 px-6 py-2 bg-accent-600 text-white rounded-lg font-medium hover:bg-accent-700 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search issues, root causes, actions..." className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500" />
        </div>
        <select value={lineFilter} onChange={e => setLineFilter(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500">
          <option value="all">All Lines</option>
          {LINE_DEPT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>

      {/* Report Log Table - Corporate Style */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-accent-700 text-white">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider w-16">Sr. No.</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider w-28">Line/Dept</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Issue</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Root Cause</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Corrective Action</th>
                {canEdit && <th className="px-4 py-3 w-20" />}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canEdit ? 6 : 5} className="px-4 py-12 text-center"><Loader2 className="w-6 h-6 text-accent-500 animate-spin mx-auto" /></td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr><td colSpan={canEdit ? 6 : 5} className="px-4 py-12 text-center text-slate-400 text-sm">No troubleshooting logs found</td></tr>
              ) : (
                filteredLogs.map((log, idx) => (
                  <tr key={log.id} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-accent-50/30 transition-colors`}>
                    <td className="px-4 py-3 text-sm font-medium text-slate-700">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium px-2 py-1 rounded bg-accent-50 text-accent-700 border border-accent-100">{log.line_dept}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap">{log.issue}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-pre-wrap">{log.root_cause || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-pre-wrap">{log.corrective_action || '-'}</td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => handleEdit(log)} className="p-1.5 text-slate-400 hover:text-accent-600 transition-colors"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(log.id)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filteredLogs.length > 0 && (
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-sm text-slate-500">
            Showing {filteredLogs.length} of {logs.length} records
          </div>
        )}
      </div>
    </div>
  );
}
