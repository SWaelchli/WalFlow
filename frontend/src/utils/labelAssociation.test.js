// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { associateLabels } from './labelAssociation';

describe('associateLabels', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('links a label to the control that follows it', () => {
    document.body.innerHTML = '<div><label>Length</label><input id="" /></div><div><label>Spec</label><div><select></select></div></div>';
    associateLabels(document);
    const [l1, l2] = document.querySelectorAll('label');
    expect(document.getElementById(l1.getAttribute('for')).tagName).toBe('INPUT');
    expect(document.getElementById(l2.getAttribute('for')).tagName).toBe('SELECT');
  });

  it('keeps existing for/id pairs and nested controls', () => {
    document.body.innerHTML = '<label for="a">A</label><input id="a"/><label><input type="checkbox"/> Tick</label>';
    associateLabels(document);
    const labels = document.querySelectorAll('label');
    expect(labels[0].getAttribute('for')).toBe('a');
    expect(labels[1].hasAttribute('for')).toBe(false);
  });

  it('does not let two labels claim one control', () => {
    document.body.innerHTML = '<div><label>One</label><label>Two</label><input /></div>';
    associateLabels(document);
    const labels = document.querySelectorAll('label');
    expect(labels[0].hasAttribute('for')).toBe(false);
    expect(labels[1].hasAttribute('for')).toBe(true);
  });
});
