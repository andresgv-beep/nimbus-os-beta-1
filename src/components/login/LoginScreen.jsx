import { useState } from 'react';
import { useAuth } from '@context';
import styles from './LoginScreen.module.css';

export default function LoginScreen() {
  const { login, user } = useAuth();
  const [username, setUsername] = useState(user?.username || '');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!username.trim() || !password) {
      setError('Enter username and password');
      return;
    }
    if (needs2FA && !totpCode) {
      setError('Enter the 6-digit code from your authenticator app');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const result = await login(username.trim(), password, needs2FA ? totpCode : undefined);
      if (result?.requires2FA) {
        setNeeds2FA(true);
        setLoading(false);
        return;
      }
    } catch (err) {
      setError(err.message || 'Login failed');
      if (needs2FA) setTotpCode('');
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit();
    if (error) setError('');
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>
        <div className={styles.avatar}>
          {username ? username[0].toUpperCase() : '?'}
        </div>

        {!needs2FA ? (
          <>
            <input
              className={styles.input}
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus={!username}
            />
            <input
              className={styles.input}
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus={!!username}
            />
          </>
        ) : (
          <>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', textAlign: 'center', marginBottom: 8 }}>
              Enter the 6-digit code from your authenticator app
            </div>
            <input
              className={styles.input}
              type="text"
              placeholder="000000"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={handleKeyDown}
              autoFocus
              style={{ textAlign: 'center', fontSize: '1.4em', letterSpacing: 6, fontFamily: 'var(--font-mono)' }}
            />
            <div
              style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', cursor: 'pointer', marginTop: 4 }}
              onClick={() => { setNeeds2FA(false); setTotpCode(''); setError(''); }}
            >
              Back to login
            </div>
          </>
        )}

        {error && <div className={styles.error}>{error}</div>}

        <button
          className={styles.loginBtn}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? 'Signing in...' : needs2FA ? 'Verify' : 'Sign In'}
        </button>

        <div className={styles.footer}>NimbusOS</div>
      </div>
    </div>
  );
}
