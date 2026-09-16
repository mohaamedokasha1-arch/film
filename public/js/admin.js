// AKAVOX Admin Scripts
document.addEventListener('DOMContentLoaded', () => {
  // Manual Import Trigger Button
  const runImportBtn = document.getElementById('btn-run-import');
  const terminalBody = document.getElementById('live-terminal-body');
  const terminalStatus = document.getElementById('terminal-status');
  const importProgressBar = document.getElementById('import-progress-bar');

  if (runImportBtn) {
    runImportBtn.addEventListener('click', async () => {
      runImportBtn.disabled = true;
      runImportBtn.innerHTML = '⏳ Importing from Internet Archive...';
      if (terminalStatus) terminalStatus.textContent = 'Running live import job...';

      if (terminalBody) {
        terminalBody.innerHTML = '<div class="terminal-line"><span class="terminal-time">' + new Date().toLocaleTimeString() + '</span> <span class="terminal-type-info">Connecting to Internet Archive API...</span></div>';
      }

      // Open EventSource for live progress
      let eventSource = null;
      try {
        eventSource = new EventSource('/api/admin/import/stream');
        eventSource.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.type === 'ping') return;
            appendTerminalLine(data);
            if (data.type === 'completed' || data.type === 'error') {
              if (eventSource) eventSource.close();
              runImportBtn.disabled = false;
              runImportBtn.innerHTML = '▶ Run Import Now';
              if (terminalStatus) terminalStatus.textContent = data.type === 'completed' ? 'Completed' : 'Error';
            }
          } catch (err) {}
        };
        eventSource.onerror = () => {
          if (eventSource) eventSource.close();
        };
      } catch (e) {
        console.warn('SSE not supported, falling back to basic request');
      }

      try {
        const response = await fetch('/api/admin/import/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        console.log('Import trigger result:', result);
        
        if (result.status === 'busy') {
          appendTerminalLine({ time: new Date().toISOString(), type: 'error', message: result.message });
          runImportBtn.disabled = false;
          runImportBtn.innerHTML = '▶ Run Import Now';
        }
      } catch (err) {
        appendTerminalLine({ time: new Date().toISOString(), type: 'error', message: 'Trigger failed: ' + err.message });
        runImportBtn.disabled = false;
        runImportBtn.innerHTML = '▶ Run Import Now';
      }
    });
  }

  function appendTerminalLine(item) {
    if (!terminalBody) return;
    const line = document.createElement('div');
    line.className = 'terminal-line';
    const timeStr = item.time ? new Date(item.time).toLocaleTimeString() : new Date().toLocaleTimeString();
    const typeClass = 'terminal-type-' + (item.type || 'info');
    line.innerHTML = `<span class="terminal-time">[${timeStr}]</span> <span class="${typeClass}">${escapeHtml(item.message || '')}</span>`;
    terminalBody.appendChild(line);
    terminalBody.scrollTop = terminalBody.scrollHeight;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});
