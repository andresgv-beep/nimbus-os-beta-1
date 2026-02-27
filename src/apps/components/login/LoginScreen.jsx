import { useState } from 'react';
import { useAuth } from '@context';
import styles from './LoginScreen.module.css';

export default function LoginScreen() {
  const { login, user } = useAuth();
  const [username, setUsername] = useState(user?.username || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!username.trim() || !password) {
      setError('Enter username and password');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message || 'Login failed');
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

        {error && <div className={styles.error}>{error}</div>}

        <button
          className={styles.loginBtn}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>

        <div className={styles.footer}>NimbusOS v0.1.0</div>
      </div>
    </div>
  );
}
