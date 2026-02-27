import { useState } from 'react';
import { useAuth } from '@context';
import styles from './SetupWizard.module.css';

export default function SetupWizard() {
  const { completeSetup } = useAuth();
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setError('');

    if (!username.trim()) return setError('Username is required');
    if (username.trim().length < 3) return setError('Username must be at least 3 characters');
    if (/[^a-zA-Z0-9_.-]/.test(username.trim())) return setError('Username can only contain letters, numbers, -, _, .');
    if (!password) return setError('Password is required');
    if (password.length < 4) return setError('Password must be at least 4 characters');
    if (password !== confirmPw) return setError('Passwords do not match');

    setLoading(true);
    try {
      await completeSetup(username.trim(), password);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (step === 0) setStep(1);
      else handleCreate();
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.logo}>
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
          </svg>
        </div>
        <h2 className={styles.title}>Welcome to NimbusOS</h2>

        {step === 0 && (
          <>
            <p className={styles.subtitle}>
              Let's set up your NAS. First, create an administrator account.
              This account will have full access to all system settings.
            </p>
            <button className={styles.btn} onClick={() => setStep(1)}>
              Get Started →
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <p className={styles.subtitle}>Create your admin account</p>

            <div className={styles.form}>
              <label className={styles.label}>Username</label>
              <input
                className={styles.input}
                type="text"
                placeholder="admin"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
              />

              <label className={styles.label}>Password</label>
              <input
                className={styles.input}
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
              />

              <label className={styles.label}>Confirm Password</label>
              <input
                className={styles.input}
                type="password"
                placeholder="Confirm password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                onKeyDown={handleKeyDown}
              />

              {error && <div className={styles.error}>{error}</div>}

              <button
                className={styles.btn}
                onClick={handleCreate}
                disabled={loading}
              >
                {loading ? 'Creating...' : 'Create Account & Start'}
              </button>
            </div>
          </>
        )}

        <div className={styles.footer}>NimbusOS v0.1.0</div>
      </div>
    </div>
  );
}
