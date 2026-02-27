import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@context';
import { ShieldIcon, HardDriveIcon, WifiIcon, UserIcon, UsersIcon, KeyIcon, HistoryIcon, BellIcon, CalendarIcon } from '@icons';
import Icon from '@icons';
import styles from './ControlPanel.module.css';

/* ─── Sidebar ─── */
const SIDEBAR = [
  { id: 'users', label: 'User Accounts', icon: UserIcon, section: 'Users' },
  { id: 'folders', label: 'Shared Folders', icon: HardDriveIcon, section: 'Permissions' },
  { id: 'appperm', label: 'App Permissions', icon: ShieldIcon },
  { id: 'login', label: 'Login Settings', icon: KeyIcon, section: 'Security' },
  { id: 'sessions', label: 'Active Sessions', icon: WifiIcon },
  { id: 'history', label: 'Login History', icon: HistoryIcon },
  { id: 'updates', label: 'Updates', icon: ShieldIcon, section: 'System' },
  { id: 'backup', label: 'Backup & Restore', icon: HardDriveIcon },
  { id: 'tasks', label: 'Scheduled Tasks', icon: CalendarIcon },
  { id: 'notif', label: 'Notifications', icon: BellIcon },
];

/* ─── Toggle ─── */
function Toggle({ on, onChange }) {
  return (
    <div className={`${styles.toggle} ${on ? styles.toggleOn : ''}`} onClick={onChange}>
      <div className={styles.toggleDot} />
    </div>
  );
}

/* ─── Permission badge ─── */
function PermBadge({ perm }) {
  if (perm === 'RW') return <span className={`${styles.permBadge} ${styles.permRW}`}>Read/Write</span>;
  if (perm === 'R') return <span className={`${styles.permBadge} ${styles.permR}`}>Read only</span>;
  return <span className={`${styles.permBadge} ${styles.permNone}`}>No access</span>;
}

/* ═══════════════════════════════════
   Users Page — LIVE from backend
   ═══════════════════════════════════ */
function UsersPage() {
  const { token } = useAuth();
  const [users, setUsers] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', confirmPw: '', role: 'user', description: '' });
  const [error, setError] = useState('');

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (Array.isArray(data)) setUsers(data);
    } catch {}
  }, [token]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const resetForm = () => {
    setForm({ username: '', password: '', confirmPw: '', role: 'user', description: '' });
    setError('');
  };

  const handleCreate = async () => {
    setError('');
    if (!form.username.trim()) return setError('Username required');
    if (!form.password) return setError('Password required');
    if (form.password.length < 4) return setError('Password min 4 chars');
    if (form.password !== form.confirmPw) return setError('Passwords don\'t match');

    const res = await fetch('/api/users', {
      method: 'POST', headers,
      body: JSON.stringify({ username: form.username, password: form.password, role: form.role, description: form.description }),
    });
    const data = await res.json();
    if (data.error) return setError(data.error);

    setShowCreate(false);
    resetForm();
    fetchUsers();
  };

  const handleEdit = async () => {
    setError('');
    if (form.password && form.password !== form.confirmPw) return setError('Passwords don\'t match');
    if (form.password && form.password.length < 4) return setError('Password min 4 chars');

    const body = { role: form.role, description: form.description };
    if (form.password) body.password = form.password;

    const res = await fetch(`/api/users/${editUser}`, {
      method: 'PUT', headers, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) return setError(data.error);

    setEditUser(null);
    resetForm();
    fetchUsers();
  };

  const handleDelete = async (username) => {
    if (!confirm(`Delete user "${username}"?`)) return;
    const res = await fetch(`/api/users/${username}`, { method: 'DELETE', headers });
    const data = await res.json();
    if (data.error) return alert(data.error);
    fetchUsers();
  };

  const openEdit = (u) => {
    setEditUser(u.username);
    setForm({ username: u.username, password: '', confirmPw: '', role: u.role, description: u.description || '' });
    setError('');
  };

  const modal = showCreate || editUser;

  const APPS_LIST = ['File Manager', 'Containers', 'Terminal', 'Virtual Machines', 'Network', 'Storage Manager', 'System Monitor', 'Control Panel'];

  return (
    <div>
      <div className={styles.pageHeader}>
        <h3 className={styles.title}>User Accounts</h3>
        <button className={styles.btnPrimary} onClick={() => { setShowCreate(true); resetForm(); }}>+ Create User</button>
      </div>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead><tr><th>User</th><th>Role</th><th>Description</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={i}>
                <td>
                  <div className={styles.userCell}>
                    <div className={styles.avatar}>{u.username[0].toUpperCase()}</div>
                    <span className={styles.cellName}>{u.username}</span>
                  </div>
                </td>
                <td><span className={`${styles.roleBadge} ${u.role === 'admin' ? styles.roleAdmin : ''}`}>{u.role}</span></td>
                <td>{u.description || '—'}</td>
                <td className={styles.mono}>{u.created ? u.created.split('T')[0] : '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button className={styles.btnSmall} onClick={() => openEdit(u)}>Edit</button>
                    {u.role !== 'admin' && (
                      <button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={() => handleDelete(u.username)}>Delete</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal — portal to body so it's not inside WindowFrame */}
      {modal && createPortal(
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalTitle}>{showCreate ? 'Create User' : `Edit: ${editUser}`}</h3>

            {/* ─── Account ─── */}
            <div className={styles.modalSection}>Account</div>

            {showCreate && (
              <>
                <label className={styles.fieldLabel}>Username</label>
                <input className={styles.fieldInput} value={form.username}
                  onChange={e => setForm({...form, username: e.target.value})} autoFocus />
              </>
            )}

            <label className={styles.fieldLabel}>{editUser ? 'New Password (leave empty to keep)' : 'Password'}</label>
            <input className={styles.fieldInput} type="password" value={form.password}
              onChange={e => setForm({...form, password: e.target.value})} />

            <label className={styles.fieldLabel}>Confirm Password</label>
            <input className={styles.fieldInput} type="password" value={form.confirmPw}
              onChange={e => setForm({...form, confirmPw: e.target.value})} />

            <label className={styles.fieldLabel}>Role</label>
            <select className={styles.fieldInput} value={form.role}
              onChange={e => setForm({...form, role: e.target.value})}>
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>

            <label className={styles.fieldLabel}>Description</label>
            <input className={styles.fieldInput} value={form.description}
              onChange={e => setForm({...form, description: e.target.value})} placeholder="Optional" />

            {/* ─── App Permissions ─── */}
            {editUser && (
              <>
                <div className={styles.modalSection}>App Permissions</div>
                <div className={styles.permGrid}>
                  {APPS_LIST.map(app => (
                    <div key={app} className={styles.permRow}>
                      <span className={styles.permApp}>{app}</span>
                      <select className={styles.permSelect} defaultValue={form.role === 'admin' ? 'allow' : 'allow'}>
                        <option value="allow">Allow</option>
                        <option value="deny">Deny</option>
                      </select>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ─── Disk Quota ─── */}
            {editUser && (
              <>
                <div className={styles.modalSection}>Disk Quota</div>
                <label className={styles.fieldLabel}>Max storage (GB) — 0 for unlimited</label>
                <input className={styles.fieldInput} type="number" defaultValue="0" min="0" placeholder="0 = unlimited" />
              </>
            )}

            {/* ─── Shared Folder Permissions ─── */}
            {editUser && (
              <>
                <div className={styles.modalSection}>Shared Folder Permissions</div>
                <div className={styles.permNote}>Folder permissions will appear here once shared folders are created in Control Panel → Shared Folders.</div>
              </>
            )}

            {error && <div className={styles.modalError}>{error}</div>}

            <div className={styles.modalActions}>
              <button className={styles.btnSecondary} onClick={() => { setShowCreate(false); setEditUser(null); }}>Cancel</button>
              <button className={styles.btnPrimary} onClick={showCreate ? handleCreate : handleEdit}>
                {showCreate ? 'Create' : 'Save'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ═══════════════════════════════════
   Shared Folders Page — LIVE from backend
   ═══════════════════════════════════ */
function SharedFoldersPage() {
  const { token } = useAuth();
  const [shares, setShares] = useState([]);
  const [users, setUsers] = useState([]);
  const [apps, setApps] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editShare, setEditShare] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [perms, setPerms] = useState({});
  const [appPerms, setAppPerms] = useState([]);
  const [error, setError] = useState('');

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  const fetchShares = useCallback(async () => {
    try {
      const res = await fetch('/api/shares', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (Array.isArray(data)) setShares(data);
    } catch {}
  }, [token]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (Array.isArray(data)) setUsers(data);
    } catch {}
  }, [token]);

  const fetchApps = useCallback(async () => {
    try {
      const res = await fetch('/api/permissions/matrix', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (data.apps) setApps(data.apps);
    } catch {}
  }, [token]);

  useEffect(() => { fetchShares(); fetchUsers(); fetchApps(); }, [fetchShares, fetchUsers, fetchApps]);

  const handleCreate = async () => {
    setError('');
    if (!form.name.trim()) return setError('Folder name required');

    const res = await fetch('/api/shares', {
      method: 'POST', headers,
      body: JSON.stringify({ name: form.name, description: form.description }),
    });
    const data = await res.json();
    if (data.error) return setError(data.error);

    setShowCreate(false);
    setForm({ name: '', description: '' });
    fetchShares();
  };

  const handleSavePerms = async () => {
    setError('');
    const res = await fetch(`/api/shares/${editShare}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ 
        permissions: perms,
        appPermissions: appPerms
      }),
    });
    const data = await res.json();
    if (data.error) return setError(data.error);

    setEditShare(null);
    fetchShares();
  };

  const handleDelete = async (name) => {
    if (!confirm(`Delete shared folder "${name}"? Files will NOT be deleted from disk.`)) return;
    const res = await fetch(`/api/shares/${name}`, { method: 'DELETE', headers });
    const data = await res.json();
    if (data.error) return alert(data.error);
    fetchShares();
  };

  const openPerms = (share) => {
    setEditShare(share.name);
    setPerms({ ...(share.permissions || {}) });
    setAppPerms([...(share.appPermissions || [])]);
    setError('');
  };

  const toggleAppPerm = (appId) => {
    if (appPerms.includes(appId)) {
      setAppPerms(appPerms.filter(a => a !== appId));
    } else {
      setAppPerms([...appPerms, appId]);
    }
  };

  const modal = showCreate || editShare;

  return (
    <div>
      <div className={styles.pageHeader}>
        <h3 className={styles.title}>Shared Folders</h3>
        <button className={styles.btnPrimary} onClick={() => { setShowCreate(true); setForm({ name: '', description: '' }); setError(''); }}>+ Create Folder</button>
      </div>

      {shares.length === 0 && (
        <div className={styles.configCard}>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            No shared folders yet. Create one to start sharing files between users.
          </p>
        </div>
      )}

      {shares.length > 0 && (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead><tr><th>Name</th><th>Description</th><th>Users</th><th>Apps</th><th></th></tr></thead>
            <tbody>
              {shares.map((s, i) => {
                const userCount = Object.values(s.permissions || {}).filter(p => p !== 'none').length;
                const appCount = (s.appPermissions || []).length;
                return (
                  <tr key={i}>
                    <td className={styles.cellName}>{s.displayName || s.name}</td>
                    <td>{s.description || '—'}</td>
                    <td>{userCount} user{userCount !== 1 ? 's' : ''}</td>
                    <td>{appCount} app{appCount !== 1 ? 's' : ''}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className={styles.btnSmall} onClick={() => openPerms(s)}>Permissions</button>
                        <button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={() => handleDelete(s.name)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Permissions Modal */}
      {modal && createPortal(
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            {showCreate ? (
              <>
                <h3 className={styles.modalTitle}>Create Shared Folder</h3>
                <label className={styles.fieldLabel}>Folder Name</label>
                <input className={styles.fieldInput} value={form.name}
                  onChange={e => setForm({...form, name: e.target.value})}
                  placeholder="e.g. media, backups, documents" autoFocus />

                <label className={styles.fieldLabel}>Description</label>
                <input className={styles.fieldInput} value={form.description}
                  onChange={e => setForm({...form, description: e.target.value})}
                  placeholder="Optional" />

                {error && <div className={styles.modalError}>{error}</div>}

                <div className={styles.modalActions}>
                  <button className={styles.btnSecondary} onClick={() => setShowCreate(false)}>Cancel</button>
                  <button className={styles.btnPrimary} onClick={handleCreate}>Create</button>
                </div>
              </>
            ) : (
              <>
                <h3 className={styles.modalTitle}>Permissions: {editShare}</h3>
                
                {/* User Permissions */}
                <div className={styles.modalSection}>User Access</div>
                <div className={styles.permGrid}>
                  {users.map(u => (
                    <div key={u.username} className={styles.permRow}>
                      <span className={styles.permApp}>
                        {u.username}
                        {u.role === 'admin' && <span className={styles.adminTag}> (Admin)</span>}
                      </span>
                      <select className={styles.permSelect}
                        value={perms[u.username] || 'none'}
                        onChange={e => setPerms({...perms, [u.username]: e.target.value})}>
                        <option value="rw">Read / Write</option>
                        <option value="ro">Read only</option>
                        <option value="none">No access</option>
                      </select>
                    </div>
                  ))}
                </div>

                {/* App Permissions */}
                {apps.length > 0 && (
                  <>
                    <div className={styles.modalSection}>Docker Apps Access</div>
                    <p className={styles.permNote}>
                      Apps with access can use this folder for media libraries, backups, etc.
                    </p>
                    <div className={styles.permGrid}>
                      {apps.map(app => (
                        <div key={app.id} className={styles.permRow}>
                          <span className={styles.permApp}>
                            {app.name}
                            <span className={styles.appTypeTag}>{app.type}</span>
                          </span>
                          <button 
                            className={`${styles.permToggleBtn} ${appPerms.includes(app.id) ? styles.permToggleBtnOn : ''}`}
                            onClick={() => toggleAppPerm(app.id)}
                          >
                            {appPerms.includes(app.id) ? '✓ Access' : 'No access'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {apps.length === 0 && (
                  <>
                    <div className={styles.modalSection}>Docker Apps Access</div>
                    <p className={styles.permNote}>
                      No Docker apps installed. Install apps from the App Store to assign folder access.
                    </p>
                  </>
                )}

                {error && <div className={styles.modalError}>{error}</div>}

                <div className={styles.modalActions}>
                  <button className={styles.btnSecondary} onClick={() => setEditShare(null)}>Cancel</button>
                  <button className={styles.btnPrimary} onClick={handleSavePerms}>Save Permissions</button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ═══════════════════════════════════
   App Permissions Page — Unified permissions matrix
   ═══════════════════════════════════ */
function AppPermissionsPage() {
  const { token } = useAuth();
  const [matrix, setMatrix] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedShare, setSelectedShare] = useState(null);
  const [localPerms, setLocalPerms] = useState({});
  
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
  
  const fetchMatrix = useCallback(async () => {
    try {
      const res = await fetch('/api/permissions/matrix', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (!data.error) {
        setMatrix(data);
      }
    } catch {}
    setLoading(false);
  }, [token]);
  
  useEffect(() => { fetchMatrix(); }, [fetchMatrix]);
  
  const openSharePerms = (share) => {
    setSelectedShare(share);
    setLocalPerms({
      userPermissions: { ...share.userPermissions },
      appPermissions: [...(share.appPermissions || [])]
    });
  };
  
  const toggleUserPerm = (username, currentPerm) => {
    const cycle = { undefined: 'ro', 'none': 'ro', 'ro': 'rw', 'rw': 'none' };
    setLocalPerms(prev => ({
      ...prev,
      userPermissions: {
        ...prev.userPermissions,
        [username]: cycle[currentPerm] || 'ro'
      }
    }));
  };
  
  const toggleAppPerm = (appId) => {
    setLocalPerms(prev => {
      const apps = prev.appPermissions || [];
      if (apps.includes(appId)) {
        return { ...prev, appPermissions: apps.filter(a => a !== appId) };
      } else {
        return { ...prev, appPermissions: [...apps, appId] };
      }
    });
  };
  
  const saveSharePerms = async () => {
    setSaving(true);
    try {
      await fetch(`/api/shares/${selectedShare.name}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          permissions: localPerms.userPermissions,
          appPermissions: localPerms.appPermissions
        })
      });
      setSelectedShare(null);
      fetchMatrix();
    } catch {}
    setSaving(false);
  };
  
  if (loading) {
    return (
      <div>
        <h3 className={styles.title}>Permisos de Carpetas y Apps</h3>
        <div className={styles.configCard}>
          <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>
        </div>
      </div>
    );
  }
  
  if (!matrix) {
    return (
      <div>
        <h3 className={styles.title}>Permisos de Carpetas y Apps</h3>
        <div className={styles.configCard}>
          <p style={{ color: 'var(--text-muted)' }}>Error al cargar permisos</p>
        </div>
      </div>
    );
  }
  
  return (
    <div>
      <h3 className={styles.title}>Permisos de Carpetas y Apps</h3>
      <p className={styles.pageDesc}>
        Configura qué usuarios y apps Docker pueden acceder a cada carpeta compartida.
      </p>
      
      {matrix.shares.length === 0 ? (
        <div className={styles.configCard}>
          <p style={{ color: 'var(--text-muted)' }}>
            No hay carpetas compartidas. Crea una en "Shared Folders".
          </p>
        </div>
      ) : (
        <div className={styles.permMatrix}>
          {matrix.shares.map(share => (
            <div key={share.name} className={styles.permMatrixCard}>
              <div className={styles.permMatrixHeader}>
                <div>
                  <strong>{share.displayName || share.name}</strong>
                  <span className={styles.permMatrixPath}>/{share.name}</span>
                </div>
                <button className={styles.btnSmall} onClick={() => openSharePerms(share)}>
                  Editar permisos
                </button>
              </div>
              
              <div className={styles.permMatrixBody}>
                <div className={styles.permMatrixSection}>
                  <span className={styles.permMatrixLabel}>Usuarios:</span>
                  <div className={styles.permMatrixTags}>
                    {Object.entries(share.userPermissions || {}).filter(([,p]) => p !== 'none').map(([user, perm]) => (
                      <span key={user} className={`${styles.permTag} ${perm === 'rw' ? styles.permTagRW : styles.permTagRO}`}>
                        {user} ({perm === 'rw' ? 'RW' : 'RO'})
                      </span>
                    ))}
                    {Object.keys(share.userPermissions || {}).filter(u => share.userPermissions[u] !== 'none').length === 0 && (
                      <span className={styles.permTagNone}>Ninguno</span>
                    )}
                  </div>
                </div>
                
                <div className={styles.permMatrixSection}>
                  <span className={styles.permMatrixLabel}>Apps:</span>
                  <div className={styles.permMatrixTags}>
                    {(share.appPermissions || []).map(app => (
                      <span key={app} className={`${styles.permTag} ${styles.permTagApp}`}>
                        {app}
                      </span>
                    ))}
                    {(share.appPermissions || []).length === 0 && (
                      <span className={styles.permTagNone}>Ninguna</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Docker Apps Section */}
      {matrix.apps.length > 0 && (
        <>
          <h4 className={styles.subTitle}>Apps Docker instaladas</h4>
          <div className={styles.appsList}>
            {matrix.apps.map(app => {
              const folders = matrix.shares.filter(s => (s.appPermissions || []).includes(app.id));
              return (
                <div key={app.id} className={styles.appCard}>
                  <div className={styles.appCardHeader}>
                    <span className={styles.appCardName}>{app.name}</span>
                    <span className={styles.appCardType}>{app.type}</span>
                  </div>
                  <div className={styles.appCardFolders}>
                    {folders.length > 0 ? (
                      folders.map(f => (
                        <span key={f.name} className={styles.folderTag}>{f.displayName || f.name}</span>
                      ))
                    ) : (
                      <span className={styles.noFolders}>Sin carpetas asignadas</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      
      {/* Edit Modal */}
      {selectedShare && createPortal(
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalTitle}>Permisos: {selectedShare.displayName || selectedShare.name}</h3>
            
            <div className={styles.modalSection}>Usuarios</div>
            <div className={styles.permEditList}>
              {matrix.users.map(user => {
                const perm = localPerms.userPermissions?.[user.username] || 'none';
                return (
                  <div key={user.username} className={styles.permEditRow}>
                    <span className={styles.permEditName}>
                      {user.username}
                      {user.role === 'admin' && <span className={styles.adminBadge}>Admin</span>}
                    </span>
                    <div className={styles.permEditBtns}>
                      <button 
                        className={`${styles.permBtn} ${perm === 'none' ? styles.permBtnActive : ''}`}
                        onClick={() => toggleUserPerm(user.username, perm === 'none' ? 'none' : 'rw')}
                      >
                        ✕
                      </button>
                      <button 
                        className={`${styles.permBtn} ${perm === 'ro' ? styles.permBtnActive : ''}`}
                        onClick={() => toggleUserPerm(user.username, perm === 'ro' ? 'ro' : 'none')}
                      >
                        RO
                      </button>
                      <button 
                        className={`${styles.permBtn} ${perm === 'rw' ? styles.permBtnActive : ''}`}
                        onClick={() => toggleUserPerm(user.username, perm === 'rw' ? 'rw' : 'ro')}
                      >
                        RW
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {matrix.apps.length > 0 && (
              <>
                <div className={styles.modalSection}>Apps Docker</div>
                <div className={styles.permEditList}>
                  {matrix.apps.map(app => {
                    const hasAccess = (localPerms.appPermissions || []).includes(app.id);
                    return (
                      <div key={app.id} className={styles.permEditRow}>
                        <span className={styles.permEditName}>
                          {app.name}
                          <span className={styles.appTypeBadge}>{app.type}</span>
                        </span>
                        <button 
                          className={`${styles.permToggle} ${hasAccess ? styles.permToggleOn : ''}`}
                          onClick={() => toggleAppPerm(app.id)}
                        >
                          {hasAccess ? '✓ Acceso' : 'Sin acceso'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            
            <div className={styles.modalActions}>
              <button className={styles.btnSecondary} onClick={() => setSelectedShare(null)}>
                Cancelar
              </button>
              <button className={styles.btnPrimary} onClick={saveSharePerms} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ─── Placeholder pages ─── */
function PlaceholderPage({ title }) {
  return (
    <div>
      <h3 className={styles.title}>{title}</h3>
      <div className={styles.configCard}>
        <div className={styles.configTitle}>Coming soon</div>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
          This section will be connected to the backend in a future update.
        </p>
      </div>
    </div>
  );
}

/* ─── Main ─── */
export default function ControlPanel() {
  const [active, setActive] = useState('users');

  const renderPage = () => {
    switch (active) {
      case 'users': return <UsersPage />;
      case 'folders': return <SharedFoldersPage />;
      case 'appperm': return <AppPermissionsPage />;
      case 'login': return <PlaceholderPage title="Login Settings" />;
      case 'sessions': return <PlaceholderPage title="Active Sessions" />;
      case 'history': return <PlaceholderPage title="Login History" />;
      case 'updates': return <PlaceholderPage title="Updates" />;
      case 'backup': return <PlaceholderPage title="Backup & Restore" />;
      case 'tasks': return <PlaceholderPage title="Scheduled Tasks" />;
      case 'notif': return <PlaceholderPage title="Notifications" />;
      default: return null;
    }
  };

  return (
    <div className={styles.layout}>
      <div className={styles.sidebar}>
        {SIDEBAR.map(item => (
          <div key={item.id}>
            {item.section && <div className={styles.sectionLabel}>{item.section}</div>}
            <div
              className={`${styles.sidebarItem} ${active === item.id ? styles.active : ''}`}
              onClick={() => setActive(item.id)}
            >
              <span className={styles.sidebarIcon}><item.icon size={16} /></span>
              {item.label}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.main}>{renderPage()}</div>
    </div>
  );
}
