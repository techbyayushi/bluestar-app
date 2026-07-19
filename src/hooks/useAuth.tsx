import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase, User, UserRole } from '../lib/supabase';

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string; mustChangePassword?: boolean }>;
  logout: () => void;
  changePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  logAudit: (action: string, entityType?: string, entityId?: string, details?: Record<string, unknown>) => Promise<void>;
  resetActivityTimer: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'rca_app_user';
const ACTIVITY_KEY = 'rca_app_last_activity';
const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Simulate JWT expiry (15 min from last activity)
  const checkSessionExpiry = useCallback(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const lastActivity = localStorage.getItem(ACTIVITY_KEY);
    if (!stored || !lastActivity) return;

    const elapsed = Date.now() - parseInt(lastActivity, 10);
    if (elapsed > INACTIVITY_TIMEOUT) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(ACTIVITY_KEY);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    checkSessionExpiry();
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setLoading(false);
  }, [checkSessionExpiry]);

  // Inactivity timeout
  useEffect(() => {
    if (!user) return;

    const events = ['mousedown', 'keydown', 'mousemove', 'click', 'scroll', 'touchstart'];
    let timeoutId: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(ACTIVITY_KEY);
        setUser(null);
      }, INACTIVITY_TIMEOUT);
    };

    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      clearTimeout(timeoutId);
    };
  }, [user]);

  const resetActivityTimer = useCallback(() => {
    if (user) {
      localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
    }
  }, [user]);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const { data, error } = await supabase.rpc('verify_login', {
        p_username: username,
        p_password: password,
      });

      if (error) {
        return { success: false, error: 'Invalid username or password' };
      }

      if (!data || data.length === 0) {
        return { success: false, error: 'Invalid username or password' };
      }

      const userData = data[0];
      const loggedInUser: User = {
        id: userData.id,
        user_id: userData.user_id,
        username: userData.username,
        full_name: userData.full_name,
        role: userData.role as UserRole,
        is_active: userData.is_active,
        department: userData.department,
        mobile: userData.mobile,
        profile_photo: userData.profile_photo,
        must_change_password: userData.must_change_password,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(loggedInUser));
      localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
      setUser(loggedInUser);

      await logAuditInternal(loggedInUser.id, 'USER_LOGIN', 'users', loggedInUser.id, { username });

      if (loggedInUser.must_change_password) {
        return { success: true, mustChangePassword: true };
      }

      return { success: true };
    } catch {
      return { success: false, error: 'Invalid username or password' };
    }
  }, []);

  const changePassword = useCallback(async (newPassword: string) => {
    if (!user) return { success: false, error: 'Not authenticated' };

    try {
      const hashedPassword = await hashPassword(newPassword);
      if (!hashedPassword) {
        return { success: false, error: 'Failed to hash password' };
      }

      const { error } = await supabase
        .from('users')
        .update({
          password_hash: hashedPassword,
          must_change_password: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      const updatedUser = { ...user, must_change_password: false };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
      setUser(updatedUser);

      await logAuditInternal(user.id, 'PASSWORD_CHANGED', 'users', user.id, {});

      return { success: true };
    } catch {
      return { success: false, error: 'Failed to change password' };
    }
  }, [user]);

  const logout = useCallback(() => {
    if (user) {
      logAuditInternal(user.id, 'USER_LOGOUT', 'users', user.id, {});
    }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ACTIVITY_KEY);
    setUser(null);
  }, [user]);

  const logAudit = useCallback(async (action: string, entityType?: string, entityId?: string, details?: Record<string, unknown>) => {
    if (!user) return;
    await logAuditInternal(user.id, action, entityType, entityId, details);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, changePassword, logAudit, resetActivityTimer }}>
      {children}
    </AuthContext.Provider>
  );
}

// We can't call Postgres crypt() from the client, so we use an edge function or RPC.
// For simplicity here, we use an RPC to hash the password server-side.
async function logAuditInternal(userId: string, action: string, entityType?: string, entityId?: string, details?: Record<string, unknown>) {
  try {
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details: details || {},
    });
  } catch {
    // Audit logging is best-effort
  }
}

// Hash a password server-side using the hash_password RPC
export async function hashPassword(password: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('hash_password', { p_password: password });
    if (error) return null;
    return data as string;
  } catch {
    return null;
  }
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
