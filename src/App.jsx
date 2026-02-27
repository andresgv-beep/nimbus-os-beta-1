import { ThemeProvider, WindowProvider, AuthProvider, useAuth } from '@context';
import { ContextMenuProvider } from '@components/desktop/ContextMenu';
import SetupWizard from '@components/wizard/SetupWizard';
import LoginScreen from '@components/login/LoginScreen';
import Desktop from '@components/desktop/Desktop';

function AppShell() {
  const { appState } = useAuth();

  return (
    <>
      {appState === 'loading' && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Loading...</div>
        </div>
      )}
      {appState === 'wizard' && <SetupWizard />}
      {appState === 'login' && <LoginScreen />}
      {appState === 'desktop' && <Desktop />}
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <WindowProvider>
          <ContextMenuProvider>
            <AppShell />
          </ContextMenuProvider>
        </WindowProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
