import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './Terminal.module.css';

const API = '/api/terminal';

export default function Terminal() {
  const [lines, setLines] = useState([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [cwd, setCwd] = useState(null);
  const [running, setRunning] = useState(false);
  const [user, setUser] = useState('');
  const [host, setHost] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Get initial info
  useEffect(() => {
    const init = async () => {
      try {
        const uRes = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: 'whoami' }),
        });
        const uData = await uRes.json();
        setUser(uData.stdout.trim());

        const hRes = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: 'hostname -s' }),
        });
        const hData = await hRes.json();
        setHost(hData.stdout.trim());

        const dRes = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: 'pwd' }),
        });
        const dData = await dRes.json();
        setCwd(dData.stdout.trim());

        const sRes = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: 'uname -sr' }),
        });
        const sData = await sRes.json();

        setLines([
          { type: 'output', text: `NimbusOS Terminal — ${sData.stdout.trim()}` },
          { type: 'output', text: `Connected to ${hData.stdout.trim()} as ${uData.stdout.trim()}` },
          { type: 'output', text: '' },
        ]);
      } catch {
        setLines([
          { type: 'error', text: 'Cannot connect to server. Run: npm run dev' },
        ]);
      }
    };
    init();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const promptStr = `${user}@${host}:${shortPath(cwd)}$ `;

  const execCmd = useCallback(async (cmd) => {
    if (!cmd.trim()) return;

    setHistory(prev => [cmd, ...prev.filter(h => h !== cmd)]);
    setHistIdx(-1);

    if (cmd.trim() === 'clear') {
      setLines([]);
      setInput('');
      return;
    }

    const promptLine = { type: 'prompt', text: `${promptStr}${cmd}` };
    setLines(prev => [...prev, promptLine]);
    setRunning(true);
    setInput('');

    try {
      // For cd, wrap command to also print new pwd
      const isCD = cmd.trim() === 'cd' || cmd.trim().startsWith('cd ');
      const execCmd = isCD
        ? `${cmd} && pwd`
        : cmd;

      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: execCmd, cwd }),
      });
      const data = await res.json();

      const newLines = [];

      if (isCD && data.code === 0) {
        // Last line of stdout is the new cwd
        const outLines = data.stdout.trim().split('\n');
        const newCwd = outLines.pop();
        setCwd(newCwd);
        // Show remaining output if any
        outLines.forEach(text => newLines.push({ type: 'output', text }));
      } else {
        if (data.stdout) {
          data.stdout.replace(/\n$/, '').split('\n').forEach(text => {
            newLines.push({ type: 'output', text });
          });
        }
      }

      if (data.stderr) {
        data.stderr.replace(/\n$/, '').split('\n').forEach(text => {
          if (text !== '') newLines.push({ type: 'error', text });
        });
      }

      if (newLines.length > 0) {
        setLines(prev => [...prev, ...newLines]);
      }

    } catch {
      setLines(prev => [...prev, { type: 'error', text: 'Connection lost' }]);
    }

    setRunning(false);
  }, [cwd, promptStr]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      execCmd(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const next = Math.min(histIdx + 1, history.length - 1);
        setHistIdx(next);
        setInput(history[next]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx > 0) {
        setHistIdx(histIdx - 1);
        setInput(history[histIdx - 1]);
      } else {
        setHistIdx(-1);
        setInput('');
      }
    } else if (e.key === 'c' && e.ctrlKey) {
      setLines(prev => [...prev, { type: 'prompt', text: `${promptStr}${input}^C` }]);
      setInput('');
      setRunning(false);
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  };

  return (
    <div className={styles.terminal} onClick={() => inputRef.current?.focus()}>
      <div className={styles.output}>
        {lines.map((line, i) => (
          <div
            key={i}
            className={
              line.type === 'prompt' ? styles.prompt :
              line.type === 'error' ? styles.error :
              styles.line
            }
          >
            {line.text}
          </div>
        ))}
        {!running && (
          <div className={styles.inputLine}>
            <span className={styles.prompt}>{promptStr}</span>
            <input
              ref={inputRef}
              className={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoFocus
            />
          </div>
        )}
        {running && (
          <div className={styles.running}>Running...</div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function shortPath(path) {
  if (!path) return '~';
  const home = '/home/';
  if (path.includes(home)) {
    const after = path.slice(path.indexOf(home) + home.length);
    const parts = after.split('/');
    if (parts.length === 1) return '~';
    return '~/' + parts.slice(1).join('/');
  }
  return path;
}
