import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The crash overlay is a classic script in public/ (the page's CSP allows no inline script). Load its source as the
// browser would run it, once, so the listeners are registered a single time.
const SOURCE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'crash-overlay.js');
const HOSTILE = '<img src=x onerror=alert(1)>';

const fireError = (message) => window.dispatchEvent(new ErrorEvent('error', { message, filename: 'app.js', lineno: 1, colno: 2, error: new Error(message) }));
const fireRejection = (reason) => {
  const event = new Event('unhandledrejection');
  event.reason = reason;
  window.dispatchEvent(event);
};

beforeAll(() => { (0, eval)(readFileSync(SOURCE, 'utf-8')); });
afterEach(() => { document.body.replaceChildren(); });

describe('crash overlay shows error text as text', () => {
  it.each([
    ['an error message', () => fireError(HOSTILE)],
    ['a rejection reason', () => fireRejection(HOSTILE)],
    ['a rejection with an error object', () => fireRejection(new Error(HOSTILE))],
  ])('%s is never parsed as markup', (_name, fire) => {
    fire();
    expect(document.body.children).toHaveLength(1);
    const overlay = document.body.children[0];
    expect(overlay.querySelector('img')).toBeNull();
    expect(overlay.textContent).toContain(HOSTILE);
  });

  it('ignores the harmless ResizeObserver notice', () => {
    fireError('ResizeObserver loop completed with undelivered notifications.');
    expect(document.body.children).toHaveLength(0);
  });
});
