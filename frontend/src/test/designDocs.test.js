// Docs sync test, two halves.
// Tokens: the `:root` custom properties in design-system/walflow/MASTER.md and frontend/src/index.css must match
// in name and value, so the design system stays the single source of truth.
// Menus: the menu bar table in the walflow-ui-layout skill must list the same menus and item labels, in order,
// as the command list (commands/commandList.js). A failure means fixing the doc or the code so they agree, never loosening this test.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listCommandsByMenu } from '../commands';

const here = dirname(fileURLToPath(import.meta.url));
const MASTER_PATH = join(here, '..', '..', '..', 'design-system', 'walflow', 'MASTER.md');
const SKILL_PATH = join(here, '..', '..', '..', '.claude', 'skills', 'walflow-ui-layout', 'SKILL.md');
const CSS_PATH = join(here, '..', 'index.css');

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

// Custom properties declared inside every `:root { ... }` block of a CSS text.
function rootTokens(css) {
  const tokens = new Map();
  const text = stripComments(css);
  const blockRe = /:root\s*\{([^}]*)\}/g;
  let block;
  while ((block = blockRe.exec(text)) !== null) {
    const declRe = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let decl;
    while ((decl = declRe.exec(block[1])) !== null) tokens.set(decl[1], decl[2]);
  }
  return tokens;
}

// Only the fenced css code blocks of the markdown count.
function masterCss(md) {
  const blocks = [];
  const fenceRe = /```css\r?\n([\s\S]*?)```/g;
  let m;
  while ((m = fenceRe.exec(md)) !== null) blocks.push(m[1]);
  return blocks.join('\n');
}

const normalise = (v) => v.replace(/\s+/g, ' ').trim().replace(/#[0-9a-fA-F]{3,8}\b/g, (h) => h.toLowerCase());

describe('design docs sync: tokens', () => {
  it('MASTER.md and index.css declare the same :root tokens with the same values', () => {
    const master = rootTokens(masterCss(readFileSync(MASTER_PATH, 'utf8')));
    const css = rootTokens(readFileSync(CSS_PATH, 'utf8'));
    expect(master.size, 'no :root tokens found in MASTER.md').toBeGreaterThan(0);
    expect(css.size, 'no :root tokens found in index.css').toBeGreaterThan(0);

    const problems = [];
    for (const [name, value] of master) {
      if (!css.has(name)) problems.push(`${name}: MASTER.md ${value.trim()}, missing in index.css`);
      else if (normalise(css.get(name)) !== normalise(value)) {
        problems.push(`${name}: MASTER.md ${value.trim()}, index.css ${css.get(name).trim()}`);
      }
    }
    for (const [name, value] of css) {
      if (!master.has(name)) problems.push(`${name}: index.css ${value.trim()}, missing in MASTER.md`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});

// Item label as the command list holds it: no shortcut, note, submenu arrow or surrounding space.
const cleanItem = (item) => item
  .replace(/`[^`]*`/g, '')
  .replace(/\([^)]*\)/g, '')
  .replace(/▸/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// `{ File: ['New drawing…', ...] }` from the rows `| **File** | a · b · — · c |` of the skill's menu table.
function docMenus(md) {
  const menus = {};
  // Only the "Menu bar" section; other tables in the skill use the same `| **Name** |` row shape
  const start = md.indexOf('### Menu bar');
  expect(start, 'no "### Menu bar" section in the skill').toBeGreaterThan(-1);
  const end = md.indexOf('\n### ', start + 1);
  md = md.slice(start, end === -1 ? undefined : end);
  const rowRe = /^\|\s*\*\*([^*]+)\*\*\s*\|(.*)\|\s*$/gm;
  let m;
  while ((m = rowRe.exec(md)) !== null) {
    menus[m[1].trim()] = m[2].split(' · ').map(cleanItem).filter((i) => i !== '' && i !== '—');
  }
  return menus;
}

describe('design docs sync: menus', () => {
  it('the menu table in the walflow-ui-layout skill lists the menus and items of the command list', () => {
    const doc = docMenus(readFileSync(SKILL_PATH, 'utf8'));
    const code = Object.fromEntries(Object.entries(listCommandsByMenu()).map(([menu, items]) => [menu, items.map((i) => cleanItem(i.label))]));
    expect(Object.keys(doc).length, 'no menu rows found in the skill').toBeGreaterThan(0);

    const problems = [];
    if (Object.keys(doc).join(',') !== Object.keys(code).join(',')) {
      problems.push(`menu order: doc ${Object.keys(doc).join(', ')}; code ${Object.keys(code).join(', ')}`);
    }
    for (const menu of new Set([...Object.keys(doc), ...Object.keys(code)])) {
      const d = doc[menu] || [];
      const c = code[menu] || [];
      for (let i = 0; i < Math.max(d.length, c.length); i += 1) {
        if (d[i] !== c[i]) problems.push(`${menu} #${i + 1}: doc ${d[i] ?? '(none)'}; code ${c[i] ?? '(none)'}`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
