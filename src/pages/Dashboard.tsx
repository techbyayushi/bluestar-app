import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase, TestRecord, TroubleshootingLog, SavingsProject } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { formatINR } from '../lib/utils';
import {
  LayoutDashboard,
  CircuitBoard,
  Wrench,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  FileText,
  IndianRupee,
  Search,
} from 'lucide-react';
import { format } from 'date-fns';

export function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Pick<TestRecord, 'id' | 'barcode' | 'inspection_status' | 'operator_name'>[]>([]);
  const [stats, setStats] = useState({
    totalInspections: 0,
    pendingApprovals: 0,
    okCount: 0,
    notOkCount: 0,
    underAnalysis: 0,
    troubleshootingCount: 0,
    totalSavings: 0,
    reportsApproved: 0,
  });
  const [recentRecords, setRecentRecords] = useState<TestRecord[]>([]);
  const [recentTroubleshooting, setRecentTroubleshooting] = useState<TroubleshootingLog[]>([]);

  useEffect(() => {
    fetchDashboardData();

    const recordsChannel = supabase.channel('dashboard-report-sync');
    recordsChannel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'test_records' },
      () => {
        fetchDashboardData();
      }
    );
    recordsChannel.subscribe();

    return () => {
      recordsChannel.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (searchTerm.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('test_records')
          .select('id, barcode, inspection_status, operator_name')
          .ilike('barcode', `%${searchTerm.trim()}%`)
          .order('created_at', { ascending: false })
          .limit(8);

        if (!error) {
          setSearchResults((data as Pick<TestRecord, 'id' | 'barcode' | 'inspection_status' | 'operator_name'>[]) || []);
        } else {
          setSearchResults([]);
        }
      } catch (err) {
        console.error('Search error:', err);
        setSearchResults([]);
      }
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const fetchDashboardData = async () => {
    setLoading(true);

    try {
      const [recordsRes, troubRes, savingsRes] = await Promise.all([
        supabase.from('test_records').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('troubleshooting_logs').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('savings_projects').select('*'),
      ]);

      const records = (recordsRes.data as TestRecord[]) || [];
      const troubLogs = (troubRes.data as TroubleshootingLog[]) || [];
      const savings = (savingsRes.data as SavingsProject[]) || [];

      setRecentRecords(records);
      setRecentTroubleshooting(troubLogs);

      setStats({
        totalInspections: records.length,
        pendingApprovals: records.filter(
          r => (r.inspection_status === 'OK' || r.inspection_status === 'Not OK') && r.status === 'In Process'
        ).length,
        okCount: records.filter(r => r.inspection_status === 'OK').length,
        notOkCount: records.filter(r => r.inspection_status === 'Not OK').length,
        underAnalysis: records.filter(r => r.inspection_status === 'Under Analysis').length,
        troubleshootingCount: troubLogs.length,
        totalSavings: savings.reduce((sum, s) => sum + Number(s.monthly_savings), 0),
        reportsApproved: records.filter(r => r.status === 'Approval').length,
      });
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {greeting}, {user?.full_name}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Track E-Cell inspections, identify failure trends, and monitor Root Cause Analysis activities.
            </p>
            <p className="mt-3 text-sm text-slate-400">
              {format(new Date(), 'EEEE, MMMM d, yyyy')}
            </p>
          </div>
          <div className="flex w-full max-w-2xl items-center gap-3">
            <div className="relative flex-1">
              <label className="relative block w-full">
                <span className="sr-only">Search</span>
                <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-400">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search inspections, reports, RCA"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                />
              </label>
              {searchTerm.trim().length >= 2 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
                  {searchResults.length > 0 ? (
                    <div className="max-h-64 overflow-auto">
                      {searchResults.map((result) => (
                        <Link
                          key={result.id}
                          to={`/inspection/${result.id}`}
                          className="flex flex-col rounded-xl px-3 py-2 text-left transition hover:bg-slate-50"
                        >
                          <span className="text-sm font-medium text-slate-800">{result.barcode}</span>
                          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                            <span>{result.inspection_status}</span>
                            <span>•</span>
                            <span>{result.operator_name || 'Unknown operator'}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl px-3 py-3 text-sm text-slate-500">No matching inspections.</div>
                  )}
                </div>
              )}
            </div>
            {/* Profile button removed per design request */}
          </div>
        </div>
      </div>

      {/* Pending Approvals Alert */}
      {stats.pendingApprovals > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-4 animate-fade-in">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-6 h-6 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">
              {stats.pendingApprovals} record{stats.pendingApprovals > 1 ? 's' : ''} awaiting analysis
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Under Analysis items require review by authorized roles
            </p>
          </div>
          <Link
            to="/reports"
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
          >
            Review Now <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<CircuitBoard className="w-6 h-6" />}
          label="Total Inspections"
          value={stats.totalInspections}
          color="accent"
          link="/pcb-testing"
        />
        <StatCard
          icon={<Clock className="w-6 h-6" />}
          label="Pending Approvals"
          value={stats.pendingApprovals}
          color="amber"
          link="/reports"
          badge={stats.pendingApprovals > 0}
        />
        <StatCard
          icon={<CheckCircle2 className="w-6 h-6" />}
          label="OK Results"
          value={stats.okCount}
          color="emerald"
          link="/tracking"
        />
        <StatCard
          icon={<XCircle className="w-6 h-6" />}
          label="Not OK Results"
          value={stats.notOkCount}
          color="red"
          link="/tracking"
        />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-accent-50 flex items-center justify-center">
                <Wrench className="w-5 h-5 text-accent-600" />
              </div>
              <span className="text-sm font-medium text-slate-600">Troubleshooting Logs</span>
            </div>
            <Link to="/troubleshooting" className="text-accent-600 hover:text-accent-700 text-sm font-medium">
              View
            </Link>
          </div>
          <p className="text-2xl font-bold text-slate-800">{stats.troubleshootingCount}</p>
          <p className="text-xs text-slate-400 mt-1">Total entries logged</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                <IndianRupee className="w-5 h-5 text-emerald-600" />
              </div>
              <span className="text-sm font-medium text-slate-600">Monthly Savings</span>
            </div>
            <Link to="/analytics" className="text-accent-600 hover:text-accent-700 text-sm font-medium">
              View
            </Link>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{formatINR(stats.totalSavings)}</p>
          <p className="text-xs text-slate-400 mt-1">From active savings projects</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
                <FileText className="w-5 h-5 text-purple-600" />
              </div>
              <span className="text-sm font-medium text-slate-600">Approved Reports</span>
            </div>
            <Link to="/reports" className="text-accent-600 hover:text-accent-700 text-sm font-medium">
              View
            </Link>
          </div>
          <p className="text-2xl font-bold text-slate-800">{stats.reportsApproved}</p>
          <p className="text-xs text-slate-400 mt-1">Reports ready for download</p>
        </div>
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent inspections */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Recent Inspections</h3>
            <Link to="/pcb-testing" className="text-accent-600 hover:text-accent-700 text-sm font-medium flex items-center gap-1">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recentRecords.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">No inspections yet</div>
            ) : (
              recentRecords.map(record => (
              <Link
                key={record.id}
                to={`/inspection/${record.id}`}
                className="block p-4 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-xl border border-transparent hover:border-slate-200"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">
                    {record.barcode}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {record.station_id || 'No station'} · {record.operator_name || 'Unknown operator'}
                  </p>
                </div>
                <StatusBadge status={record.inspection_status} />
              </Link>
            ))
            )}
          </div>
        </div>

        {/* Recent troubleshooting */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Recent Troubleshooting</h3>
            <Link to="/troubleshooting" className="text-accent-600 hover:text-accent-700 text-sm font-medium flex items-center gap-1">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recentTroubleshooting.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">No troubleshooting logs yet</div>
            ) : (
              recentTroubleshooting.map(log => (
                <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-accent-50 text-accent-600">
                      {log.line_dept}
                    </span>
                    <span className="text-xs text-slate-400">{format(new Date(log.created_at), 'MMM d, yyyy')}</span>
                  </div>
                  <p className="text-sm text-slate-600 line-clamp-2">{log.issue}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
  link,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: 'accent' | 'amber' | 'emerald' | 'red';
  link: string;
  badge?: boolean;
}) {
  const colorMap = {
    accent: 'bg-accent-50 text-accent-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <Link
      to={link}
      className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-slate-300 transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          {icon}
        </div>
        {badge && value > 0 && (
          <span className="flex h-6 min-w-6 items-center justify-center px-2 bg-red-500 text-white text-xs font-bold rounded-full animate-scale-in">
            {value}
          </span>
        )}
      </div>
      <p className="text-3xl font-bold text-slate-800">{value}</p>
      <p className="text-sm text-slate-500 mt-1">{label}</p>
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    'OK': 'bg-emerald-50 text-emerald-600 border-emerald-200',
    'Not OK': 'bg-red-50 text-red-600 border-red-200',
    'Under Analysis': 'bg-amber-50 text-amber-600 border-amber-200',
  };

  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${styles[status] || styles['Under Analysis']}`}>
      {status}
    </span>
  );
}
