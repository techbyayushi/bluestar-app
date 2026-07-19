import { useState, useEffect, useRef } from 'react';
import { supabase, User, UserRole, AuditLog } from '../lib/supabase';
import { useAuth, hashPassword } from '../hooks/useAuth';
import { useTheme, ACCENT_PRESETS } from '../hooks/useTheme';
import {
  Users,
  Key,
  User as UserIcon,
  Plus,
  Search,
  Edit2,
  Loader2,
  CheckCircle2,
  XCircle,
  Save,
  Activity,
  Palette,
  X,
  Camera,
} from 'lucide-react';
import { format } from 'date-fns';

export function Settings() {
  const { user, logAudit } = useAuth();
  const { accentId, setAccentId } = useTheme();
  const isAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState<'workspace' | 'users' | 'audit'>('workspace');
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    role: 'ecell' as UserRole,
    department: '',
    mobile: '',
    user_id: '',
    profile_photo: '',
    must_change_password: true,
  });

  useEffect(() => {
    if (activeTab === 'users') fetchUsers();
    else if (activeTab === 'audit') fetchAuditLogs();
  }, [activeTab]);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await supabase.from('users').select('*').order('created_at', { ascending: false });
    if (data) setUsers(data as User[]);
    setLoading(false);
  };

  const fetchAuditLogs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('audit_logs')
      .select('*, users(full_name)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (data) setAuditLogs(data as any);
    setLoading(false);
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1 * 1024 * 1024) { alert('Photo must be under 1MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setFormData({ ...formData, profile_photo: reader.result as string });
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      full_name: '',
      role: 'ecell',
      department: '',
      mobile: '',
      user_id: '',
      profile_photo: '',
      must_change_password: true,
    });
    setEditingUser(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowUserModal(true);
  };

  const openEditModal = (u: User) => {
    setEditingUser(u);
    setFormData({
      username: u.username,
      password: '',
      full_name: u.full_name,
      role: u.role,
      department: u.department || '',
      mobile: u.mobile || '',
      user_id: u.user_id || '',
      profile_photo: u.profile_photo || '',
      must_change_password: u.must_change_password,
    });
    setShowUserModal(true);
  };

  const handleCreateUser = async () => {
    if (!formData.username.trim() || !formData.full_name.trim() || !formData.password.trim()) {
      alert('Please fill username, full name, and password');
      return;
    }
    setSaving(true);
    try {
      const hashed = await hashPassword(formData.password);
      if (!hashed) { alert('Failed to hash password'); setSaving(false); return; }

      const { error } = await supabase.from('users').insert({
        username: formData.username,
        full_name: formData.full_name,
        role: formData.role,
        password_hash: hashed,
        department: formData.department || null,
        mobile: formData.mobile || null,
        user_id: formData.user_id || null,
        profile_photo: formData.profile_photo || null,
        must_change_password: formData.must_change_password,
        is_active: true,
      });

      if (error) {
        alert(error.message.includes('duplicate') ? 'Username already exists' : 'Failed to create user');
        setSaving(false);
        return;
      }

      await logAudit('USER_CREATED', 'users', undefined, { username: formData.username, role: formData.role });
      setShowUserModal(false);
      resetForm();
      fetchUsers();
    } catch (err) {
      console.error('Create user error:', err);
      alert('Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    setSaving(true);
    try {
      const updateData: Record<string, unknown> = {
        full_name: formData.full_name,
        role: formData.role,
        department: formData.department || null,
        mobile: formData.mobile || null,
        user_id: formData.user_id || null,
        profile_photo: formData.profile_photo || null,
        must_change_password: formData.must_change_password,
        updated_at: new Date().toISOString(),
      };

      if (formData.password) {
        const hashed = await hashPassword(formData.password);
        if (hashed) {
          updateData.password_hash = hashed;
          updateData.must_change_password = true;
        }
      }

      const { error } = await supabase.from('users').update(updateData).eq('id', editingUser.id);
      if (error) throw error;

      await logAudit('USER_UPDATED', 'users', editingUser.id, { role: formData.role });
      setShowUserModal(false);
      resetForm();
      fetchUsers();
    } catch (err) {
      console.error('Update user error:', err);
      alert('Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (u: User) => {
    const { error } = await supabase
      .from('users')
      .update({ is_active: !u.is_active, updated_at: new Date().toISOString() })
      .eq('id', u.id);
    if (!error) {
      await logAudit('USER_STATUS_CHANGE', 'users', u.id, { enabled: !u.is_active });
      fetchUsers();
    }
  };

  const handleResetPassword = async (u: User) => {
    const newPass = prompt(`Enter new password for ${u.username}:`);
    if (!newPass || newPass.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }
    const hashed = await hashPassword(newPass);
    if (!hashed) { alert('Failed to hash password'); return; }

    const { error } = await supabase
      .from('users')
      .update({ password_hash: hashed, must_change_password: true, updated_at: new Date().toISOString() })
      .eq('id', u.id);
    if (!error) {
      await logAudit('PASSWORD_RESET', 'users', u.id, {});
      alert('Password reset. User will be prompted to change on next login.');
    }
  };

  const filteredUsers = users.filter(u =>
    u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.department || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredLogs = auditLogs.filter(log =>
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log as any).users?.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const inputClass =
    'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-500';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Workspace configuration, user management, and audit trail</p>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border border-slate-200 rounded-lg p-1 w-fit">
        <TabButton active={activeTab === 'workspace'} onClick={() => setActiveTab('workspace')} icon={<Palette className="w-4 h-4" />} label="Workspace" />
        {isAdmin && <TabButton active={activeTab === 'users'} onClick={() => setActiveTab('users')} icon={<Users className="w-4 h-4" />} label="Users" />}
        {isAdmin && <TabButton active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} icon={<Activity className="w-4 h-4" />} label="Audit" />}
      </div>

      {/* Workspace Tab - Accent Color */}
      {activeTab === 'workspace' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-2">
              <Palette className="w-5 h-5 text-accent-600" />
              <h2 className="font-semibold text-slate-800">Accent Color</h2>
            </div>
            <p className="text-sm text-slate-500 mb-5">Choose a primary accent color for the workspace. Changes apply instantly.</p>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {ACCENT_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => setAccentId(preset.id)}
                  className={`relative p-4 rounded-xl border-2 transition-all ${
                    accentId === preset.id
                      ? 'border-slate-800 shadow-md scale-105'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex gap-1.5 mb-3 justify-center">
                    {Object.entries(preset.vars)
                      .filter(([k]) => ['--accent-400', '--accent-600', '--accent-700'].includes(k))
                      .map(([k, v]) => (
                        <div key={k} className="w-7 h-7 rounded-full" style={{ backgroundColor: `rgb(${v})` }} />
                      ))}
                  </div>
                  <p className="text-sm font-medium text-slate-700">{preset.name}</p>
                  {accentId === preset.id && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-slate-800 rounded-full flex items-center justify-center">
                      <CheckCircle2 className="w-3 h-3 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Current user profile */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-800 mb-4">Your Profile</h2>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-accent-100 flex items-center justify-center overflow-hidden">
                {user?.profile_photo ? (
                  <img src={user.profile_photo} alt={user.full_name} className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="w-8 h-8 text-accent-600" />
                )}
              </div>
              <div>
                <p className="font-semibold text-slate-800">{user?.full_name}</p>
                <p className="text-sm text-slate-500">@{user?.username} · {user?.department || 'No department'}</p>
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mt-1 ${
                  user?.role === 'admin' ? 'bg-red-50 text-red-600' : user?.role === 'ecell' ? 'bg-accent-50 text-accent-600' : 'bg-amber-50 text-amber-600'
                }`}>{user?.role}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && isAdmin && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search users..." className={`pl-9 ${inputClass}`} />
            </div>
            <button onClick={openCreateModal} className="flex items-center gap-2 px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700 shadow-sm">
              <Plus className="w-4 h-4" /> Add User
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['User', 'Username', 'Dept', 'Role', 'Status', 'Created', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center"><Loader2 className="w-6 h-6 text-accent-500 animate-spin mx-auto" /></td></tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">No users found</td></tr>
                  ) : filteredUsers.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-accent-100 flex items-center justify-center overflow-hidden">
                            {u.profile_photo ? <img src={u.profile_photo} alt={u.full_name} className="w-full h-full object-cover" /> : <UserIcon className="w-5 h-5 text-accent-600" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-700">{u.full_name}</p>
                            {u.user_id && <p className="text-xs text-slate-400">{u.user_id}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 font-mono">{u.username}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{u.department || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          u.role === 'admin' ? 'bg-red-50 text-red-600' : u.role === 'ecell' ? 'bg-accent-50 text-accent-600' : 'bg-amber-50 text-amber-600'
                        }`}>{u.role}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleToggleActive(u)} disabled={u.id === user?.id} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                          u.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                        } ${u.id === user?.id ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          {u.is_active ? <><CheckCircle2 className="w-3 h-3" /> Active</> : <><XCircle className="w-3 h-3" /> Disabled</>}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">{format(new Date(u.created_at), 'MMM d, yyyy')}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => openEditModal(u)} className="p-1.5 text-slate-400 hover:text-accent-600"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => handleResetPassword(u)} className="p-1.5 text-slate-400 hover:text-amber-500" title="Reset Password"><Key className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Audit Tab */}
      {activeTab === 'audit' && isAdmin && (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search audit logs..." className={`pl-9 ${inputClass}`} />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Timestamp', 'User', 'Action', 'Entity', 'Details'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center"><Loader2 className="w-6 h-6 text-accent-500 animate-spin mx-auto" /></td></tr>
                  ) : filteredLogs.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400 text-sm">No audit logs found</td></tr>
                  ) : filteredLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-400">{format(new Date(log.created_at), 'MMM d, yyyy HH:mm:ss')}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{(log as any).users?.full_name || 'System'}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 bg-accent-50 text-accent-600 text-xs font-medium rounded">{log.action}</span></td>
                      <td className="px-4 py-3 text-sm text-slate-600">{log.entity_type || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-400 max-w-xs truncate">{Object.keys(log.details || {}).length > 0 ? JSON.stringify(log.details) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4" onClick={() => { setShowUserModal(false); resetForm(); }}>
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">{editingUser ? 'Edit User' : 'Create New User'}</h3>
              <button onClick={() => { setShowUserModal(false); resetForm(); }} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-160px)] space-y-4">
              {/* Photo */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-accent-100 flex items-center justify-center overflow-hidden">
                  {formData.profile_photo ? <img src={formData.profile_photo} alt="Profile" className="w-full h-full object-cover" /> : <UserIcon className="w-8 h-8 text-accent-600" />}
                </div>
                <button onClick={() => photoInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">
                  <Camera className="w-4 h-4" /> Upload Photo
                </button>
                <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name *</label>
                  <input type="text" value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Username *</label>
                  <input type="text" value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} disabled={!!editingUser} className={`${inputClass} disabled:opacity-50`} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">User ID</label>
                  <input type="text" value={formData.user_id} onChange={e => setFormData({ ...formData, user_id: e.target.value })} placeholder="EMP001" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Role</label>
                  <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })} className={inputClass}>
                    <option value="ecell">E-Cell Employee</option>
                    <option value="auditor">Auditor (Read-only)</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Department</label>
                  <input type="text" value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })} placeholder="E-Cell" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Mobile</label>
                  <input type="text" value={formData.mobile} onChange={e => setFormData({ ...formData, mobile: e.target.value })} placeholder="+91..." className={inputClass} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Password {editingUser ? '(leave blank to keep current)' : '*'}
                  </label>
                  <input type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} placeholder="Enter password" className={inputClass} />
                </div>
                <label className="col-span-2 flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={formData.must_change_password} onChange={e => setFormData({ ...formData, must_change_password: e.target.checked })} className="w-4 h-4 accent-accent-600" />
                  Require password change on next login
                </label>
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={() => { setShowUserModal(false); resetForm(); }} className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm">Cancel</button>
              <button onClick={editingUser ? handleUpdateUser : handleCreateUser} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {editingUser ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
        active ? 'bg-accent-600 text-white' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {icon} {label}
    </button>
  );
}
