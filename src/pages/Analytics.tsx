import { useState, useEffect } from 'react';
import { supabase, TestRecord, TroubleshootingLog, SavingsProject, RcaCostMetric } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { formatINR } from '../lib/utils';
import {
  TrendingUp,
  IndianRupee,
  Package,
  BarChart3,
  Calendar,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RotateCcw,
  Activity,
  CircuitBoard,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  format,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
} from 'date-fns';

type TimeRange = 'monthly' | 'quarterly' | 'yearly';

export function Analytics() {
  const { user, logAudit } = useAuth();
  const [timeRange, setTimeRange] = useState<TimeRange>('monthly');
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<TestRecord[]>([]);
  const [troubleshooting, setTroubleshooting] = useState<TroubleshootingLog[]>([]);
  const [savings, setSavings] = useState<SavingsProject[]>([]);
  const [rcaMetrics, setRcaMetrics] = useState<RcaCostMetric[]>([]);

  const [showSavingsForm, setShowSavingsForm] = useState(false);
  const [showRcaForm, setShowRcaForm] = useState(false);
  const [savingsForm, setSavingsForm] = useState({ project_name: '', description: '', monthly_savings: 0 });
  const [rcaForm, setRcaForm] = useState({ pcb_name: '', part_code: '', cost_per_pcb: 0, month_count: 1 });

  const canEdit = user?.role === 'admin' || user?.role === 'ecell';

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [recRes, troubRes, savRes, rcaRes] = await Promise.all([
      supabase.from('test_records').select('*'),
      supabase.from('troubleshooting_logs').select('*'),
      supabase.from('savings_projects').select('*').order('created_at', { ascending: false }),
      supabase.from('rca_cost_metrics').select('*').order('created_at', { ascending: false }),
    ]);
    if (recRes.data) setRecords(recRes.data as TestRecord[]);
    if (troubRes.data) setTroubleshooting(troubRes.data as TroubleshootingLog[]);
    if (savRes.data) setSavings(savRes.data as SavingsProject[]);
    if (rcaRes.data) setRcaMetrics(rcaRes.data as RcaCostMetric[]);
    setLoading(false);
  };

  // Time range filtering
  const getDateRange = () => {
    const now = new Date();
    switch (timeRange) {
      case 'monthly':
        return { start: startOfMonth(subMonths(now, 11)), end: endOfMonth(now) };
      case 'quarterly':
        return { start: startOfQuarter(subMonths(now, 9)), end: endOfQuarter(now) };
      case 'yearly':
        return { start: startOfYear(subMonths(now, 24)), end: endOfYear(now) };
    }
  };

  const { start, end } = getDateRange();
  const filteredRecords = records.filter(r => {
    const d = new Date(r.created_at);
    return d >= start && d <= end;
  });

  // Status breakdown widgets
  const totalAnalyzed = filteredRecords.length;
  const fieldReturns = filteredRecords.filter(r => r.failure_type === 'Field Failure Analysis').length;
  const lineReturns = filteredRecords.filter(r => r.failure_type === 'Line Failure Analysis').length;
  const okCount = filteredRecords.filter(r => r.inspection_status === 'OK').length;
  const notOkCount = filteredRecords.filter(r => r.inspection_status === 'Not OK').length;
  const underAnalysis = filteredRecords.filter(r => r.inspection_status === 'Under Analysis').length;

  // Line failure chart data
  const lineFailureMap = new Map<string, number>();
  troubleshooting.forEach(log => {
    const count = lineFailureMap.get(log.line_dept) || 0;
    lineFailureMap.set(log.line_dept, count + 1);
  });
  const lineFailureData = Array.from(lineFailureMap.entries())
    .map(([line, count]) => ({ line, count }))
    .sort((a, b) => b.count - a.count);

  // Recurrence tracking: repeated issues vs new issues over time
  const periodKey = (d: Date) => {
    if (timeRange === 'monthly') return format(d, 'MMM yy');
    if (timeRange === 'quarterly') return `Q${Math.ceil((d.getMonth() + 1) / 3)} ${format(d, 'yy')}`;
    return format(d, 'yyyy');
  };

  const periods: string[] = [];
  const now = new Date();
  const periodCount = timeRange === 'monthly' ? 12 : timeRange === 'quarterly' ? 8 : 5;
  for (let i = periodCount - 1; i >= 0; i--) {
    const d = timeRange === 'monthly' ? subMonths(now, i) : timeRange === 'quarterly' ? subMonths(now, i * 3) : subMonths(now, i * 12);
    periods.push(periodKey(d));
  }

  // Detect repeated issues by comparing issue text similarity across periods
  const issueMap = new Map<string, Set<string>>(); // period -> set of issue signatures
  periods.forEach(p => issueMap.set(p, new Set()));

  troubleshooting.forEach(log => {
    const key = periodKey(new Date(log.created_at));
    if (issueMap.has(key)) {
      const signature = log.issue.toLowerCase().slice(0, 50);
      issueMap.get(key)!.add(signature);
    }
  });

  const seenIssues = new Set<string>();
  const recurrenceData = periods.map(p => {
    const currentIssues = issueMap.get(p) || new Set<string>();
    let repeated = 0;
    let newIssues = 0;
    currentIssues.forEach(sig => {
      if (seenIssues.has(sig)) repeated++;
      else { newIssues++; seenIssues.add(sig); }
    });
    return { period: p, repeated, new: newIssues };
  });

  // Savings
  const totalMonthlySavings = savings.reduce((sum, s) => sum + Number(s.monthly_savings), 0);

  // RCA cost metrics
  const rcaData = rcaMetrics.map(m => ({
    ...m,
    totalCost: Number(m.cost_per_pcb) * m.month_count,
  }));
  const totalRcaCost = rcaData.reduce((sum, r) => sum + r.totalCost, 0);

  // Handle savings form
  const handleSaveSavings = async () => {
    if (!savingsForm.project_name.trim()) return;
    const { error } = await supabase.from('savings_projects').insert({
      project_name: savingsForm.project_name,
      description: savingsForm.description,
      monthly_savings: savingsForm.monthly_savings,
      created_by: user?.id,
    });
    if (!error) {
      await logAudit('SAVINGS_PROJECT_CREATED', 'savings_projects', undefined, {});
      setSavingsForm({ project_name: '', description: '', monthly_savings: 0 });
      setShowSavingsForm(false);
      fetchAll();
    }
  };

  const handleDeleteSavings = async (id: string) => {
    if (!confirm('Delete this savings project?')) return;
    await supabase.from('savings_projects').delete().eq('id', id);
    fetchAll();
  };

  const handleSaveRca = async () => {
    if (!rcaForm.pcb_name.trim() || !rcaForm.part_code.trim()) return;
    const { error } = await supabase.from('rca_cost_metrics').insert({
      pcb_name: rcaForm.pcb_name,
      part_code: rcaForm.part_code,
      cost_per_pcb: rcaForm.cost_per_pcb,
      month_count: rcaForm.month_count,
      created_by: user?.id,
    });
    if (!error) {
      await logAudit('RCA_METRIC_CREATED', 'rca_cost_metrics', undefined, {});
      setRcaForm({ pcb_name: '', part_code: '', cost_per_pcb: 0, month_count: 1 });
      setShowRcaForm(false);
      fetchAll();
    }
  };

  const handleDeleteRca = async (id: string) => {
    if (!confirm('Delete this RCA metric?')) return;
    await supabase.from('rca_cost_metrics').delete().eq('id', id);
    fetchAll();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const inputClass =
    'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-accent-500';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Analytics & Savings Track</h1>
          <p className="text-sm text-slate-500 mt-1">RCA cost metrics, issue analytics, and savings tracker</p>
        </div>
        {/* Time Range Filter */}
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-slate-400" />
          <div className="flex bg-white border border-slate-200 rounded-lg p-1">
            {(['monthly', 'quarterly', 'yearly'] as TimeRange[]).map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${
                  timeRange === range
                    ? 'bg-accent-600 text-white'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Status Breakdown Widgets */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <Activity className="w-5 h-5 text-accent-600" /> Status Breakdown
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <WidgetCard icon={<BarChart3 className="w-5 h-5" />} label="Total Analyzed" value={totalAnalyzed} color="accent" />
          <WidgetCard icon={<Package className="w-5 h-5" />} label="Field Returns" value={fieldReturns} color="purple" />
          <WidgetCard icon={<Package className="w-5 h-5" />} label="Line Returns" value={lineReturns} color="blue" />
          <WidgetCard icon={<CheckCircle2 className="w-5 h-5" />} label="OK Count" value={okCount} color="emerald" />
          <WidgetCard icon={<XCircle className="w-5 h-5" />} label="Not OK Count" value={notOkCount} color="red" />
          <WidgetCard icon={<AlertCircle className="w-5 h-5" />} label="Under Analysis" value={underAnalysis} color="amber" />
        </div>
      </div>

      {/* Savings Tracker */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IndianRupee className="w-5 h-5 text-emerald-600" />
            <h2 className="font-semibold text-slate-800">Financial Savings Tracker</h2>
            <span className="text-sm text-slate-400 ml-2">Monthly Total: <span className="font-semibold text-emerald-600">{formatINR(totalMonthlySavings)}</span></span>
          </div>
          {canEdit && (
            <button onClick={() => setShowSavingsForm(!showSavingsForm)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent-50 text-accent-600 rounded-lg hover:bg-accent-100">
              <Plus className="w-4 h-4" /> Add Project
            </button>
          )}
        </div>

        {showSavingsForm && (
          <div className="p-4 bg-slate-50 border-b border-slate-100 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <input type="text" placeholder="Project name" value={savingsForm.project_name} onChange={e => setSavingsForm({ ...savingsForm, project_name: e.target.value })} className={inputClass} />
              <input type="text" placeholder="Description" value={savingsForm.description} onChange={e => setSavingsForm({ ...savingsForm, description: e.target.value })} className={inputClass} />
              <input type="number" placeholder="Monthly savings (₹)" value={savingsForm.monthly_savings || ''} onChange={e => setSavingsForm({ ...savingsForm, monthly_savings: parseFloat(e.target.value) || 0 })} className={inputClass} />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSavingsForm(false)} className="px-4 py-1.5 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
              <button onClick={handleSaveSavings} className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-accent-600 text-white rounded-lg hover:bg-accent-700"><Save className="w-4 h-4" /> Save</button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Project Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Description</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Monthly Savings</th>
                {canEdit && <th className="px-4 py-3 w-12" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {savings.length === 0 ? (
                <tr><td colSpan={canEdit ? 4 : 3} className="px-4 py-8 text-center text-slate-400 text-sm">No savings projects yet</td></tr>
              ) : savings.map(s => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-700">{s.project_name}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{s.description || '-'}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-emerald-600 text-right">{formatINR(Number(s.monthly_savings))}</td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <button onClick={() => handleDeleteSavings(s.id)} className="p-1 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {savings.length > 0 && (
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-sm font-semibold text-slate-700">Total Monthly Savings</td>
                  <td className="px-4 py-3 text-sm font-bold text-emerald-600 text-right">{formatINR(totalMonthlySavings)}</td>
                  {canEdit && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* RCA Cost Metrics Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CircuitBoard className="w-5 h-5 text-accent-600" />
            <h2 className="font-semibold text-slate-800">RCA Cost Metrics</h2>
            <span className="text-sm text-slate-400 ml-2">Total Cost: <span className="font-semibold text-accent-600">{formatINR(totalRcaCost)}</span></span>
          </div>
          {canEdit && (
            <button onClick={() => setShowRcaForm(!showRcaForm)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent-50 text-accent-600 rounded-lg hover:bg-accent-100">
              <Plus className="w-4 h-4" /> Add Metric
            </button>
          )}
        </div>

        {showRcaForm && (
          <div className="p-4 bg-slate-50 border-b border-slate-100 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
              <input type="text" placeholder="PCB Name" value={rcaForm.pcb_name} onChange={e => setRcaForm({ ...rcaForm, pcb_name: e.target.value })} className={inputClass} />
              <input type="text" placeholder="Part Code" value={rcaForm.part_code} onChange={e => setRcaForm({ ...rcaForm, part_code: e.target.value })} className={inputClass} />
              <input type="number" placeholder="Cost per PCB (₹)" value={rcaForm.cost_per_pcb || ''} onChange={e => setRcaForm({ ...rcaForm, cost_per_pcb: parseFloat(e.target.value) || 0 })} className={inputClass} />
              <input type="number" placeholder="Month Count" value={rcaForm.month_count} onChange={e => setRcaForm({ ...rcaForm, month_count: parseInt(e.target.value) || 1 })} className={inputClass} />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowRcaForm(false)} className="px-4 py-1.5 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
              <button onClick={handleSaveRca} className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-accent-600 text-white rounded-lg hover:bg-accent-700"><Save className="w-4 h-4" /> Save</button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-accent-700 text-white">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">PCB Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Part Code</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase">Cost per PCB</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase">Month Count</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase">Total Cost</th>
                {canEdit && <th className="px-4 py-3 w-12" />}
              </tr>
            </thead>
            <tbody>
              {rcaData.length === 0 ? (
                <tr><td colSpan={canEdit ? 6 : 5} className="px-4 py-8 text-center text-slate-400 text-sm">No RCA metrics yet</td></tr>
              ) : rcaData.map((r, idx) => (
                <tr key={r.id} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-accent-50/30`}>
                  <td className="px-4 py-3 text-sm font-medium text-slate-700">{r.pcb_name}</td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-600">{r.part_code}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 text-right">{formatINR(Number(r.cost_per_pcb))}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 text-right">{r.month_count}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-accent-600 text-right">{formatINR(r.totalCost)}</td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <button onClick={() => handleDeleteRca(r.id)} className="p-1 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {rcaData.length > 0 && (
              <tfoot className="bg-accent-50 border-t-2 border-accent-200">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-slate-700">Grand Total</td>
                  <td className="px-4 py-3 text-sm font-bold text-accent-700 text-right">{formatINR(totalRcaCost)}</td>
                  {canEdit && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Line Failure Chart */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-accent-600" />
            <h3 className="font-semibold text-slate-800">Line / Dept Failure Occurrences</h3>
          </div>
          <div className="h-80">
            {lineFailureData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lineFailureData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="line" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                    formatter={(v) => [`${v} issues`, 'Count']}
                  />
                  <Bar dataKey="count" name="Issue Count" fill="rgb(var(--accent-600))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">No troubleshooting data for this period</div>
            )}
          </div>
        </div>

        {/* Recurrence Tracking Chart */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <RotateCcw className="w-5 h-5 text-accent-600" />
            <h3 className="font-semibold text-slate-800">Issue Recurrence vs New Issues</h3>
          </div>
          <div className="h-80">
            {recurrenceData.some(d => d.repeated > 0 || d.new > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={recurrenceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="new" name="New Issues" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="repeated" name="Repeated Issues" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">No recurrence data for this period</div>
            )}
          </div>
        </div>
      </div>

      {/* Savings summary card */}
      <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-2xl p-6 text-white shadow-lg shadow-emerald-500/10">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center">
              <TrendingUp className="w-7 h-7" />
            </div>
            <div>
              <p className="text-emerald-100 text-sm">Total Monthly Savings</p>
              <p className="text-3xl font-bold">{formatINR(totalMonthlySavings)}</p>
              <p className="text-emerald-100 text-xs mt-1">Annual projected: {formatINR(totalMonthlySavings * 12)}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-emerald-100 text-sm">Active Projects</p>
            <p className="text-3xl font-bold">{savings.length}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function WidgetCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: 'accent' | 'amber' | 'emerald' | 'red' | 'blue' | 'purple';
}) {
  const colorMap = {
    accent: 'bg-accent-50 text-accent-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${colorMap[color]}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  );
}
