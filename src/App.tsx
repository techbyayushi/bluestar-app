import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import { Layout } from './components/Layout';
import { isSupabaseConfigured, supabaseConfigError } from './lib/supabase';
import { ConfigErrorScreen } from './components/ConfigErrorScreen';
import { Login } from './pages/Login';
import { ForcePasswordChange } from './pages/ForcePasswordChange';
import { Dashboard } from './pages/Dashboard';
import { PCBTesting } from './pages/PCBTesting';
import { Tracking } from './pages/Tracking';
import { Analytics } from './pages/Analytics';
import { Reports } from './pages/Reports';
import { Troubleshooting } from './pages/Troubleshooting';
import { Settings } from './pages/Settings';
import { InspectionReport } from './pages/InspectionReport';

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">Loading...</p>
      </div>
    </div>
  );
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;

  if (user.must_change_password && window.location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (user && !user.must_change_password) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/change-password" element={<PrivateRoute><ForcePasswordChange /></PrivateRoute>} />

      <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/pcb-testing" element={<PCBTesting />} />
        <Route path="/tracking" element={<Tracking />} />
        <Route path="/troubleshooting" element={<Troubleshooting />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/inspection/:id" element={<InspectionReport />} />
        <Route path="/inspection/:id/edit" element={<InspectionReport editMode />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  if (!isSupabaseConfigured) {
    return <ConfigErrorScreen message={supabaseConfigError || 'Supabase environment variables are missing.'} />;
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
