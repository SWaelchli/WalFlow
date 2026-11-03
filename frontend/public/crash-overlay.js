// Full-page report of an uncaught error, so a crash is never just a blank page. A separate file because the page's
// Content-Security-Policy allows no inline script. Error text can quote user data, so it is only ever set as text.
(function () {
  function element(tag, text) {
    var el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function labelled(label, value) {
    var line = element('p');
    line.appendChild(element('strong', label + ': '));
    line.appendChild(document.createTextNode(String(value)));
    return line;
  }

  function showOverlay(id, title, lines, stack) {
    var overlay = element('div');
    overlay.id = id;
    Object.assign(overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      backgroundColor: '#FEF2F2',
      color: '#EF4444',
      padding: '24px',
      boxSizing: 'border-box',
      fontFamily: 'monospace',
      zIndex: '999999',
      overflowY: 'auto',
    });
    overlay.appendChild(element('h2', title));
    lines.forEach(function (line) { overlay.appendChild(line); });
    var pre = element('pre', stack || 'No stack trace available');
    Object.assign(pre.style, {
      background: '#FEE2E2',
      padding: '12px',
      borderRadius: '6px',
      border: '1px solid #FCA5A5',
      color: '#EF4444',
      overflow: 'auto',
    });
    overlay.appendChild(pre);
    document.body.appendChild(overlay);
  }

  window.addEventListener('error', function (event) {
    // Benign browser notice (layout changed during a resize callback); not a crash.
    if (event.message && event.message.indexOf('ResizeObserver loop') === 0) {
      event.stopImmediatePropagation();
      return;
    }
    showOverlay('vite-runtime-error-overlay', '🚨 Runtime Crash Detected', [
      labelled('Message', event.message),
      labelled('File', event.filename + ':' + event.lineno + ':' + event.colno),
    ], event.error && event.error.stack);
  });

  window.addEventListener('unhandledrejection', function (event) {
    showOverlay('vite-promise-error-overlay', '🚨 Unhandled Promise Rejection Detected', [
      labelled('Reason', event.reason),
    ], event.reason && event.reason.stack);
  });
})();
