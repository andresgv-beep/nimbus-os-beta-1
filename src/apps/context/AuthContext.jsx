import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const AuthContext = createContext(null);
const API = '/api/auth';
const TOKEN_KEY = 'nimbusos_token';

export function AuthProvider({ children }) {
  const [appState, setAppState] = useState('loading'); // 'loading' | 'wizard' | 'login' | 'desktop'
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));

  useEffect(() => {
    const init = async () => {
      try {
        const statusRes = await fetch(`${API}/status`);
        const status = await statusRes.json();

        if (!status.setup) {
          setAppState('wizard');
          return;
        }

        if (token) {
          const meRes = await fetch(`${API}/me`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          const me = await meRes.json();
          if (me.user) {
            setUser(me.user);
            setAppState('desktop');
            return;
          }
        }

        setAppState('login');
      } catch {
        setAppState('login');
      }
    };
    init();
  }, []);

  const saveToken = (t) => {
    setToken(t);
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  };

  const completeSetup = useCallback(async (username, password) => {
    const res = await fetch(`${API}/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    saveToken(data.token);
    setUser(data.user);
    setAppState('desktop');
    return data;
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    saveToken(data.token);
    setUser(data.user);
    setAppState('desktop');
    return data;
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      try {
        await fetch(`${API}/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        });
      } catch {}
    }
    saveToken(null);
    setUser(null);
    setAppState('login');
  }, [token]);

  const lock = useCallback(() => {
    setAppState('login');
  }, []);

  const value = {
    appState,
    user,
    token,
    isLoggedIn: appState === 'desktop',
    isAdmin: user?.role === 'admin',
    completeSetup,
    login,
    logout,
    lock,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
