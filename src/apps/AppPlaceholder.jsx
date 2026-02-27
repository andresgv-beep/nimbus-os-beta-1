import { getAppMeta } from '@/apps';
import Icon from '@icons';

export default function AppPlaceholder({ appId }) {
  const meta = getAppMeta(appId);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      gap: 'var(--space-4)',
      color: 'var(--text-muted)',
    }}>
      <div style={{
        width: 64,
        height: 64,
        borderRadius: 'var(--radius-lg)',
        background: meta?.color || '#666',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.4,
      }}>
        <Icon name={meta?.icon} size={28} stroke="white" />
      </div>
      <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-medium)' }}>
        {meta?.title || appId}
      </div>
      <div style={{ fontSize: 'var(--text-sm)' }}>
        Component coming soon
      </div>
    </div>
  );
}
