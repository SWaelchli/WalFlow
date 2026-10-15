// Keyboard support for elements that react to clicks but are not native buttons.
const activate = (e) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    e.currentTarget.click();
  }
};

/** Spread on a clickable div/span: announced as a button, focusable, Enter/Space activate. */
export const clickableProps = { role: 'button', tabIndex: 0, onKeyDown: activate };

/** Spread on a clickable table row or header cell, where a button role would break table semantics. */
export const clickableRowProps = { tabIndex: 0, onKeyDown: activate };
