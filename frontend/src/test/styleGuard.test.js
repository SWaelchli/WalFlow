// Static guard for canvas nodes (MASTER.md "Canvas values"): node files carry no colours or font sizes of their own.
// Values go through NodeReadout and states through StatusBadge; colour and size come from CSS classes and tokens.
// A failure means moving the style into index.css, never loosening this test.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const NODES_DIR = join(here, '..', 'nodes');

const RULES = [
  { name: 'hex colour', re: /#[0-9a-fA-F]{3,8}\b/ },
  { name: 'rgb/rgba colour', re: /\brgba?\s*\(/ },
  // style property or JSX attribute with a numeric size; `data.fontSize` (a data field) has no `:` or `=` after it
  { name: 'numeric fontSize', re: /\bfontSize\s*(?::|=)\s*(?:\{\s*)?['"]?\d/ },
];

function violations(line) {
  return RULES.filter((r) => r.re.test(line)).map((r) => r.name);
}

describe('style guard: matcher', () => {
  it.each([
    ["color: '#fff'", ['hex colour']],
    ['stroke="#1A2B3C4D"', ['hex colour']],
    ["background: 'rgb(1, 2, 3)'", ['rgb/rgba colour']],
    ["fill: 'rgba(0,0,0,0.5)'", ['rgb/rgba colour']],
    ['style={{ fontSize: 10 }}', ['numeric fontSize']],
    ["fontSize: '10px'", ['numeric fontSize']],
    ['<text fontSize="9">', ['numeric fontSize']],
    ['<text fontSize={9}>', ['numeric fontSize']],
    ['const textClass = TEXT_CLASSES[data.fontSize] || TEXT_CLASSES.md;', []],
    ["fontSize: 'var(--text-sm)'", []],
    ["color: 'var(--color-text)'", []],
    ['<StatusBadge kind="danger">OFF</StatusBadge>', []],
  ])('classifies %s', (line, expected) => {
    expect(violations(line)).toEqual(expected);
  });
});

describe('style guard: node files', () => {
  it('no node file has a hex or rgb colour literal or a numeric fontSize', () => {
    const files = readdirSync(NODES_DIR).filter((f) => f.endsWith('.jsx') && !/\.test\.jsx$/.test(f));
    expect(files.length, 'no node files found').toBeGreaterThan(0);
    const problems = [];
    for (const file of files) {
      readFileSync(join(NODES_DIR, file), 'utf8').split(/\r?\n/).forEach((line, i) => {
        for (const rule of violations(line)) problems.push(`nodes/${file}:${i + 1}: ${rule}: ${line.trim()}`);
      });
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
