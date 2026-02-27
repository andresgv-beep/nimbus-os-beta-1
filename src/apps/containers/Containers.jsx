import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth, useWindows } from '@context';
import styles from './Containers.module.css';

const POLL_MS = 5000;

export default function Containers() {
  const { token, user } = useAuth();
  const { openWindow } = useWindows();
  
  const [containers, setContainers] = useState([]);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(null);
  const [hasPermission, setHasPermission] = useState(true);
  const [dockerInstalled, setDockerInstalled] = useState(true);
  const [showNoPermission, setShowNoPermission] = useState(false);
  
  const mountedRef = useRef(true);
  const timerRef = useRef(null);

  const fetchContainers = useCallback(async () => {
    try {
      // First check Docker status and permissions
      const statusRes = await fetch('/api/docker/status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const statusData = await statusRes.json();
      
      if (!mountedRef.current) return;
      
      // Docker must be actually running on the system
      if (!statusData.dockerRunning) {
        setDockerInstalled(false);
        setLive(false);
        return;
      }
      
      setDockerInstalled(true);
      
      if (!statusData.hasPermission) {
        setHasPermission(false);
        setShowNoPermission(true);
        setLive(false);
        return;
      }
      
      setHasPermission(true);
      
      // Fetch containers from the existing endpoint
      const res = await fetch('/api/containers', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) throw new Error();
      const data = await res.json();
      
      if (!mountedRef.current) return;
      setContainers(data);
      setLive(true);
      
    } catch {
      if (mountedRef.current) setLive(false);
    }
  }, [token]);

  useEffect(() => {
    mountedRef.current = true;
    fetchContainers();
    timerRef.current = setInterval(fetchContainers, POLL_MS);
    return () => { 
      mountedRef.current = false; 
      clearInterval(timerRef.current); 
    };
  }, [fetchContainers]);

  const doAction = async (name, action) => {
    setLoading(name);
    try {
      await fetch(`/api/containers/${name}/${action}`, { 
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setTimeout(fetchContainers, 1000);
    } catch {}
    setTimeout(() => setLoading(null), 1500);
  };

  const handleGoToPermissions = () => {
    setShowNoPermission(false);
    openWindow('controlpanel');
  };

  const handleGoToAppStore = () => {
    openWindow('appstore');
  };

  const running = containers.filter(c => c.state === 'running').length;
  const stopped = containers.length - running;

  // No permission modal
  if (showNoPermission) {
    return (
      <div className={styles.container}>
        <div className={styles.noPermOverlay}>
          <div className={styles.noPermModal}>
            <div className={styles.noPermIcon}>🔒</div>
            <h3>Sin permisos</h3>
            <p>No tienes permisos para gestionar Docker y los contenedores.</p>
            <p className={styles.noPermHint}>Contacta con el administrador para obtener acceso.</p>
            
            <div className={styles.noPermActions}>
              <button className={styles.btnSecondary} onClick={() => setShowNoPermission(false)}>
                Cerrar
              </button>
              {user?.role === 'admin' && (
                <button className={styles.btnPrimary} onClick={handleGoToPermissions}>
                  Ir a Permisos
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Docker not installed
  if (!dockerInstalled) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>🐳</span>
          <h3>Docker no está en ejecución</h3>
          <p>Docker no está instalado o no está corriendo en este sistema.</p>
          <p className={styles.emptyHint}>
            Instala Docker: <code>curl -fsSL https://get.docker.com | sh</code>
          </p>
          <button className={styles.btnPrimary} onClick={handleGoToAppStore}>
            Ir a App Store
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Containers</h3>
          {live ? (
            <p className={styles.subtitle}>
              {running} running · {stopped} stopped · {containers.length} total
              <span className={styles.live}> ● LIVE</span>
            </p>
          ) : (
            <p className={styles.subtitle}>
              Conectando con Docker...
            </p>
          )}
        </div>
        <button className={styles.btnRefresh} onClick={fetchContainers} title="Actualizar">
          ↻
        </button>
      </div>

      {containers.length === 0 && live && (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📦</span>
          <h3>No hay contenedores</h3>
          <p>Instala aplicaciones desde la App Store para crear contenedores.</p>
          <button className={styles.btnPrimary} onClick={handleGoToAppStore}>
            Ir a App Store
          </button>
        </div>
      )}

      {containers.length > 0 && (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Imagen</th>
                <th>Estado</th>
                <th>Puertos</th>
                <th>CPU</th>
                <th>Memoria</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {containers.map((c, i) => (
                <tr key={c.id || i} className={loading === c.name ? styles.rowLoading : ''}>
                  <td className={styles.cellName}>
                    <span className={styles.containerName}>{c.name}</span>
                  </td>
                  <td className={styles.mono}>{c.image?.split(':')[0]}</td>
                  <td>
                    <div className={styles.statusCell}>
                      <span className={`${styles.dot} ${
                        c.state === 'running' ? styles.dotRunning : 
                        c.state === 'paused' ? styles.dotPaused : 
                        styles.dotStopped
                      }`} />
                      <span className={styles.stateText}>
                        {c.state === 'running' ? 'Ejecutando' : 
                         c.state === 'paused' ? 'Pausado' : 
                         c.state === 'exited' ? 'Detenido' : c.state}
                      </span>
                    </div>
                  </td>
                  <td className={styles.mono}>{c.ports || '—'}</td>
                  <td className={styles.mono}>
                    <span className={styles.statValue}>{c.cpu || '—'}</span>
                  </td>
                  <td className={styles.mono}>
                    <span className={styles.statValue}>{c.mem || '—'}</span>
                  </td>
                  <td>
                    <div className={styles.actionBtns}>
                      {c.state === 'running' ? (
                        <>
                          <button 
                            className={styles.btnStop} 
                            onClick={() => doAction(c.name, 'stop')} 
                            title="Detener"
                          >
                            ⏹
                          </button>
                          <button 
                            className={styles.btnAction} 
                            onClick={() => doAction(c.name, 'restart')} 
                            title="Reiniciar"
                          >
                            ↻
                          </button>
                        </>
                      ) : c.state === 'paused' ? (
                        <button 
                          className={styles.btnStart} 
                          onClick={() => doAction(c.name, 'unpause')} 
                          title="Reanudar"
                        >
                          ▶
                        </button>
                      ) : (
                        <button 
                          className={styles.btnStart} 
                          onClick={() => doAction(c.name, 'start')} 
                          title="Iniciar"
                        >
                          ▶
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
