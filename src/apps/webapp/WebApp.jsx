import { useState, useEffect, useRef } from 'react';
import styles from './WebApp.module.css';

/**
 * WebApp - Renders a Docker app inside an iframe.
 * Simple and reliable: just loads the iframe. No auto-detection magic.
 * Apps that block iframes should be marked external:true in catalog.
 */
export default function WebApp({ appId, port, name }) {
  const [status, setStatus] = useState('loading');
  const iframeRef = useRef(null);
  
  const baseUrl = window.location.hostname;
  const appUrl = `http://${baseUrl}:${port}`;
  
  // Pre-check: is the app responding?
  useEffect(() => {
    setStatus('loading');
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    
    fetch(appUrl, { mode: 'no-cors', signal: controller.signal })
      .then(() => {
        clearTimeout(timeout);
        setStatus('ready');
      })
      .catch(() => {
        clearTimeout(timeout);
        setStatus('error');
      });
    
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [appId, port, appUrl]);
  
  const openExternal = () => {
    window.open(appUrl, '_blank');
  };
  
  const reload = () => {
    setStatus('loading');
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.src = 'about:blank';
      setTimeout(() => { iframe.src = appUrl; setStatus('ready'); }, 200);
    }
  };

  return (
    <div className={styles.container}>
      {status === 'loading' && (
        <div className={styles.loadingOverlay}>
          <div className={styles.spinner} />
          <p>Cargando {name || appId}...</p>
        </div>
      )}
      
      {status === 'error' && (
        <div className={styles.errorOverlay}>
          <div className={styles.errorIcon}>⚠️</div>
          <h3>No se puede conectar a {name || appId}</h3>
          <p>La app no está corriendo o el puerto {port} no es accesible.</p>
          <div className={styles.errorActions}>
            <button className={styles.btnSecondary} onClick={reload}>
              Reintentar
            </button>
            <button className={styles.btnPrimary} onClick={openExternal}>
              Abrir en navegador
            </button>
          </div>
        </div>
      )}
      
      {status === 'ready' && (
        <iframe
          ref={iframeRef}
          id={`webapp-${appId}`}
          className={styles.iframe}
          src={appUrl}
          title={name || appId}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
          allow="fullscreen; autoplay; clipboard-write"
        />
      )}
    </div>
  );
}
