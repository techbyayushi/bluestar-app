import { useState, useEffect } from 'react';
import { supabase, TestRecord, User, ReportStatus } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import {
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  Eye,
  Loader2,
  RefreshCw,
  Lock,
  PlayCircle,
  FileText,
} from 'lucide-react';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface TestRecordWithDetails extends TestRecord {
  tester?: User;
  approver?: User;
}

export function Reports() {
  const { user, logAudit } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isEcell = user?.role === 'ecell' || isAdmin;

  const [records, setRecords] = useState<TestRecordWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ReportStatus>('all');
  const [selectedRecord, setSelectedRecord] = useState<TestRecordWithDetails | null>(null);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'approve' | 'reject' | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [rejectionRemarks, setRejectionRemarks] = useState('');
  const [processing, setProcessing] = useState(false);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    fetchRecords();
  }, [statusFilter, dateFrom, dateTo]);

  const fetchRecords = async () => {
    setLoading(true);
    let query = supabase
      .from('test_records')
      .select(`*`)
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (dateFrom) query = query.gte('created_at', new Date(dateFrom).toISOString());
    if (dateTo) query = query.lte('created_at', new Date(dateTo + 'T23:59:59').toISOString());

    const { data } = await query;
    if (data) setRecords(data as TestRecordWithDetails[]);
    setLoading(false);
  };

  const verifyPassword = async (): Promise<boolean> => {
    const { data: config } = await supabase.from('approval_config').select('approval_password').maybeSingle();
    if (!config) return false;
    return password === config.approval_password;
  };

  const handleStartProcess = async (record: TestRecordWithDetails) => {
    setProcessing(true);
    try {
      await supabase.from('test_records').update({ status: 'In Process' }).eq('id', record.id);
      await logAudit('REPORT_IN_PROCESS', 'test_records', record.id, { barcode: record.barcode });
      fetchRecords();
    } catch {
      console.error('Process error');
    } finally {
      setProcessing(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedRecord) return;
    setPasswordError('');
    const isValid = await verifyPassword();
    if (!isValid) { setPasswordError('Invalid password'); return; }

    setProcessing(true);
    try {
      await supabase.from('test_records').update({
        status: 'Approval',
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
      }).eq('id', selectedRecord.id);
      await logAudit('REPORT_APPROVED', 'test_records', selectedRecord.id, { barcode: selectedRecord.barcode });
      closeModals();
      fetchRecords();
    } catch {
      setPasswordError('Approval failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRecord) return;
    if (!rejectionRemarks.trim()) { setPasswordError('Rejection remarks required'); return; }
    setPasswordError('');
    const isValid = await verifyPassword();
    if (!isValid) { setPasswordError('Invalid password'); return; }

    setProcessing(true);
    try {
      await supabase.from('test_records').update({
        status: 'Rejected',
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
        rejection_remarks: rejectionRemarks,
      }).eq('id', selectedRecord.id);
      await logAudit('REPORT_REJECTED', 'test_records', selectedRecord.id, { barcode: selectedRecord.barcode });
      closeModals();
      fetchRecords();
    } catch {
      setPasswordError('Rejection failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleResubmit = async (record: TestRecordWithDetails) => {
    setProcessing(true);
    try {
      await supabase.from('test_records').update({ status: 'Pending', rejection_remarks: null }).eq('id', record.id);
      await logAudit('REPORT_RESUBMITTED', 'test_records', record.id, { barcode: record.barcode });
      fetchRecords();
    } catch {
      console.error('Resubmit error');
    } finally {
      setProcessing(false);
    }
  };

  const handleUpdateInspectionStatus = async (record: TestRecordWithDetails, newStatus: 'OK' | 'Not OK') => {
    setProcessing(true);
    try {
      await supabase.from('test_records').update({ inspection_status: newStatus }).eq('id', record.id);
      await logAudit('INSPECTION_STATUS_UPDATED', 'test_records', record.id, { barcode: record.barcode, newStatus });
      fetchRecords();
      if (selectedRecord) setSelectedRecord({ ...selectedRecord, inspection_status: newStatus });
    } catch {
      console.error('Update error');
    } finally {
      setProcessing(false);
    }
  };

  const downloadReport = async (record: TestRecordWithDetails) => {
    if (record.status !== 'Approval') {
      alert('Only approved reports can be downloaded');
      return;
    }
    await logAudit('REPORT_DOWNLOADED', 'test_records', record.id, { barcode: record.barcode });

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.setTextColor(30, 64, 175);
    doc.text('RCA Test Report', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}`, 14, 27);
    doc.text(`Report ID: ${record.id}`, 14, 32);

    autoTable(doc, {
      startY: 40,
      head: [['Field', 'Value']],
      body: [
        ['Barcode', record.barcode],
        ['Station ID', record.station_id || 'N/A'],
        ['Operator', record.operator_name || 'N/A'],
        ['Failure Type', record.failure_type || 'N/A'],
        ['Inspection Date', format(new Date(record.inspection_date), 'MMM d, yyyy')],
        ['Inspection Status', record.inspection_status],
        ['Expected Result', record.expected_result || 'N/A'],
        ['Actual Result', record.actual_result || 'N/A'],
        ['Inspection Remarks', record.inspection_remarks || 'N/A'],
        ['Report Status', record.status],
        ['Approved At', record.approved_at ? format(new Date(record.approved_at), 'MMM d, yyyy HH:mm') : 'N/A'],
      ],
      headStyles: { fillColor: [30, 64, 175], textColor: 255 },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [241, 245, 249] },
    });

    doc.save(`RCA_Report_${record.barcode}_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  const closeModals = () => {
    setShowPasswordModal(false);
    setSelectedRecord(null);
    setPassword('');
    setPasswordError('');
    setRejectionRemarks('');
    setPendingAction(null);
  };

  const filteredRecords = records.filter(r =>
    r.barcode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.station_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.operator_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const statusStyles: Record<ReportStatus, string> = {
    'Pending': 'bg-amber-50 text-amber-600 border-amber-200',
    'In Process': 'bg-blue-50 text-blue-600 border-blue-200',
    'Approval': 'bg-emerald-50 text-emerald-600 border-emerald-200',
    'Rejected': 'bg-red-50 text-red-600 border-red-200',
  };

  const statusIcons: Record<ReportStatus, React.ReactNode> = {
    'Pending': <Clock className="w-3.5 h-3.5" />,
    'In Process': <PlayCircle className="w-3.5 h-3.5" />,
    'Approval': <CheckCircle2 className="w-3.5 h-3.5" />,
    'Rejected': <XCircle className="w-3.5 h-3.5" />,
  };

  const inputClass =
    'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-accent-500';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
        <p className="text-sm text-slate-500 mt-1">Review inspection records and manage approval workflow</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatusStatCard label="Pending" count={records.filter(r => r.status === 'Pending').length} icon={<Clock className="w-6 h-6" />} color="amber" />
        <StatusStatCard label="In Process" count={records.filter(r => r.status === 'In Process').length} icon={<PlayCircle className="w-6 h-6" />} color="blue" />
        <StatusStatCard label="Approved" count={records.filter(r => r.status === 'Approval').length} icon={<CheckCircle2 className="w-6 h-6" />} color="emerald" />
        <StatusStatCard label="Rejected" count={records.filter(r => r.status === 'Rejected').length} icon={<XCircle className="w-6 h-6" />} color="red" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search..." className={`pl-9 ${inputClass}`} />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className={inputClass}>
            <option value="all">All Status</option>
            <option value="Pending">Pending</option>
            <option value="In Process">In Process</option>
            <option value="Approval">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputClass} />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputClass} />
        </div>
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Barcode', 'Station', 'Operator', 'Inspection', 'Report Status', 'Date', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center"><Loader2 className="w-6 h-6 text-accent-500 animate-spin mx-auto" /></td></tr>
              ) : filteredRecords.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">No records found</td></tr>
              ) : filteredRecords.map(record => (
                <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-mono text-accent-600 font-medium">{record.barcode}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{record.station_id || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{record.operator_name || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                      record.inspection_status === 'OK' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                      record.inspection_status === 'Not OK' ? 'bg-red-50 text-red-600 border-red-200' :
                      'bg-amber-50 text-amber-600 border-amber-200'
                    }`}>{record.inspection_status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${statusStyles[record.status]}`}>
                      {statusIcons[record.status]} {record.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">{format(new Date(record.created_at), 'MMM d, yyyy')}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setSelectedRecord(record)} className="p-1.5 text-slate-400 hover:text-accent-600 transition-colors" title="View"><Eye className="w-4 h-4" /></button>
                      {record.status === 'Pending' && isEcell && (
                        <button onClick={() => handleStartProcess(record)} disabled={processing} className="p-1.5 text-blue-500 hover:text-blue-600" title="Start Processing"><PlayCircle className="w-4 h-4" /></button>
                      )}
                      {record.status === 'Approval' && (
                        <button onClick={() => downloadReport(record)} className="p-1.5 text-slate-400 hover:text-accent-600" title="Download PDF"><Download className="w-4 h-4" /></button>
                      )}
                      {record.status === 'Rejected' && (
                        <button onClick={() => handleResubmit(record)} disabled={processing} className="p-1.5 text-amber-500 hover:text-amber-600" title="Resubmit"><RefreshCw className="w-4 h-4" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4" onClick={() => setSelectedRecord(null)}>
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2"><FileText className="w-5 h-5 text-accent-600" /> Report Details</h3>
              <button onClick={() => setSelectedRecord(null)} className="text-slate-400 hover:text-slate-600"><XCircle className="w-5 h-5" /></button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)] space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs text-slate-400">Barcode</label><p className="text-accent-600 font-mono">{selectedRecord.barcode}</p></div>
                <div><label className="text-xs text-slate-400">Report Status</label><p className="font-semibold text-slate-700">{selectedRecord.status}</p></div>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <h4 className="text-sm font-medium text-slate-700 mb-3">Inspection Details</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-slate-400">Station:</span> <span className="text-slate-700">{selectedRecord.station_id || 'N/A'}</span></div>
                  <div><span className="text-slate-400">Operator:</span> <span className="text-slate-700">{selectedRecord.operator_name || 'N/A'}</span></div>
                  <div><span className="text-slate-400">Date:</span> <span className="text-slate-700">{format(new Date(selectedRecord.inspection_date), 'MMM d, yyyy')}</span></div>
                  <div><span className="text-slate-400">Failure Type:</span> <span className="text-slate-700">{selectedRecord.failure_type || 'N/A'}</span></div>
                  <div><span className="text-slate-400">Expected:</span> <span className="text-slate-700">{selectedRecord.expected_result || 'N/A'}</span></div>
                  <div><span className="text-slate-400">Actual:</span> <span className="text-slate-700">{selectedRecord.actual_result || 'N/A'}</span></div>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400">Inspection Status</label>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-sm font-medium px-3 py-1 rounded-full border ${
                    selectedRecord.inspection_status === 'OK' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                    selectedRecord.inspection_status === 'Not OK' ? 'bg-red-50 text-red-600 border-red-200' :
                    'bg-amber-50 text-amber-600 border-amber-200'
                  }`}>{selectedRecord.inspection_status}</span>
                  {isEcell && selectedRecord.inspection_status === 'Under Analysis' && (
                    <>
                      <button onClick={() => handleUpdateInspectionStatus(selectedRecord, 'OK')} disabled={processing} className="px-3 py-1 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">Mark OK</button>
                      <button onClick={() => handleUpdateInspectionStatus(selectedRecord, 'Not OK')} disabled={processing} className="px-3 py-1 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">Mark Not OK</button>
                    </>
                  )}
                </div>
              </div>

              {selectedRecord.inspection_remarks && (
                <div><label className="text-xs text-slate-400">Inspection Remarks</label><p className="text-sm text-slate-600 mt-1">{selectedRecord.inspection_remarks}</p></div>
              )}

              {selectedRecord.before_photo_url && (
                <div>
                  <label className="text-xs text-slate-400">Photos</label>
                  <div className="flex gap-3 mt-2">
                    <img src={selectedRecord.before_photo_url} alt="Before" className="w-32 h-32 object-cover rounded-lg border border-slate-200" />
                    {selectedRecord.after_photo_url && <img src={selectedRecord.after_photo_url} alt="After" className="w-32 h-32 object-cover rounded-lg border border-slate-200" />}
                  </div>
                </div>
              )}

              {selectedRecord.status === 'Rejected' && selectedRecord.rejection_remarks && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <label className="text-xs text-red-500">Rejection Remarks</label>
                  <p className="text-sm text-red-600 mt-1">{selectedRecord.rejection_remarks}</p>
                </div>
              )}

              {selectedRecord.status === 'In Process' && (
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">Rejection Remarks (required if rejecting)</label>
                  <textarea value={rejectionRemarks} onChange={e => setRejectionRemarks(e.target.value)} rows={3} className={inputClass} placeholder="Enter rejection reason..." />
                </div>
              )}
            </div>

            <div className="p-5 border-t border-slate-200 flex justify-between items-center">
              <button onClick={() => setSelectedRecord(null)} className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm">Close</button>
              <div className="flex gap-2">
                {selectedRecord.status === 'Pending' && isEcell && (
                  <button onClick={() => handleStartProcess(selectedRecord)} disabled={processing} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-1.5"><PlayCircle className="w-4 h-4" /> Start</button>
                )}
                {selectedRecord.status === 'In Process' && (
                  <>
                    <button onClick={() => { setPendingAction('reject'); setShowPasswordModal(true); setPassword(''); setPasswordError(''); }} disabled={!rejectionRemarks.trim()} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 flex items-center gap-1.5 disabled:opacity-50"><XCircle className="w-4 h-4" /> Reject</button>
                    <button onClick={() => { setPendingAction('approve'); setShowPasswordModal(true); setPassword(''); setPasswordError(''); }} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Approve</button>
                  </>
                )}
                {selectedRecord.status === 'Approval' && (
                  <button onClick={() => downloadReport(selectedRecord)} className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm hover:bg-accent-700 flex items-center gap-1.5"><Download className="w-4 h-4" /> Download PDF</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4" onClick={closeModals}>
          <div className="bg-white rounded-xl w-full max-w-md overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-200 flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-500" />
              <h3 className="font-semibold text-slate-800">Password Required</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-500">Enter approval password to {pendingAction === 'approve' ? 'approve' : 'reject'} this report.</p>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password..." className={inputClass} autoFocus />
              {passwordError && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm">{passwordError}</div>}
            </div>
            <div className="p-5 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={closeModals} className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm">Cancel</button>
              <button onClick={() => pendingAction === 'approve' ? handleApprove() : handleReject()} disabled={processing || !password.trim()} className={`px-5 py-2 text-white rounded-lg text-sm flex items-center gap-1.5 disabled:opacity-50 ${pendingAction === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}>
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusStatCard({ label, count, icon, color }: { label: string; count: number; icon: React.ReactNode; color: string }) {
  const colorMap: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-800 mt-1">{count}</p>
      </div>
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${colorMap[color]}`}>{icon}</div>
    </div>
  );
}
