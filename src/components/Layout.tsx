import { useState, useEffect } from 'react';
import { NavLink, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  LayoutDashboard,
  CircuitBoard,
  ClipboardList,
  Wrench,
  BarChart3,
  FileText,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User as UserIcon,
  Menu,
  X,
} from 'lucide-react';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'ecell', 'auditor'] },
  { to: '/pcb-testing', label: 'E-Cell Inspection', icon: CircuitBoard, roles: ['admin', 'ecell'] },
  { to: '/tracking', label: 'E-Cell Track', icon: ClipboardList, roles: ['admin', 'ecell', 'auditor'] },
  { to: '/troubleshooting', label: 'Troubleshooting', icon: Wrench, roles: ['admin', 'ecell', 'auditor'] },
  { to: '/analytics', label: 'Analytics & Savings', icon: BarChart3, roles: ['admin', 'ecell', 'auditor'] },
  { to: '/reports', label: 'Reports', icon: FileText, roles: ['admin', 'ecell', 'auditor'] },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, roles: ['admin'] },
];

const INACTIVITY_TIMEOUT = 15 * 60 * 1000;

export function Layout() {
  const { user, logout, resetActivityTimer } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const lastActivity = parseInt(localStorage.getItem('rca_app_last_activity') || '0', 10);

  const handleUserActivity = () => {
    resetActivityTimer();
  };

  useEffect(() => {
    window.addEventListener('click', handleUserActivity);
    return () => window.removeEventListener('click', handleUserActivity);
  });

  const filteredNav = navItems.filter(item => item.roles.includes(user?.role || ''));

  const roleLabel = user?.role === 'admin' ? 'Administrator' : user?.role === 'ecell' ? 'E-Cell Employee' : 'Auditor';
  const roleBadgeColor = user?.role === 'admin' ? 'bg-red-50 text-red-600' : user?.role === 'ecell' ? 'bg-accent-50 text-accent-600' : 'bg-amber-50 text-amber-600';

  return (
    <div className="min-h-screen bg-slate-50 flex" onMouseMove={handleUserActivity}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen z-40 bg-white border-r border-slate-200 transition-all duration-300 flex flex-col ${
          collapsed ? 'w-20' : 'w-64'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 flex-shrink-0">
          <div className={`flex items-center gap-3 ${collapsed ? 'justify-center w-full' : ''}`}>
            <div className="w-9 h-9 rounded-lg bg-accent-600 flex items-center justify-center flex-shrink-0">
              <CircuitBoard className="w-5 h-5 text-white" />
            </div>
            {!collapsed && (
              <div className="overflow-hidden">
                <p className="font-bold text-slate-800 text-sm leading-tight">E-Cell RCA</p>
                <p className="text-xs text-slate-400 leading-tight">Inspection Tracker</p>
              </div>
            )}
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {filteredNav.map(item => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-accent-50 text-accent-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  } ${collapsed ? 'justify-center' : ''}`
                }
                title={collapsed ? item.label : undefined}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <div className="border-t border-slate-200 p-3 flex-shrink-0 hidden lg:block">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-sm"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header */}
        <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-20 flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden text-slate-500 hover:text-slate-700"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="hidden sm:block">
              <h2 className="text-sm font-semibold text-slate-700">
                {filteredNav.find(n => n.to === location.pathname)?.label || 'Dashboard'}
              </h2>
              <p className="text-xs text-slate-400">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Session timer removed */}

            {/* User profile badge */}
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-slate-700 leading-tight">{user?.full_name}</p>
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 ${roleBadgeColor}`}>
                  {roleLabel}
                </span>
              </div>
              <div className="w-9 h-9 rounded-full bg-accent-100 flex items-center justify-center overflow-hidden">
                {user?.profile_photo ? (
                  <img src={user.profile_photo} alt={user.full_name} className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="w-5 h-5 text-accent-600" />
                )}
              </div>
              <button
                onClick={logout}
                className="text-slate-400 hover:text-red-500 transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-x-hidden">
          <div className="animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
