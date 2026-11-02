// Static guard for canvas nodes (MASTER.md "Canvas values"): node files carry no colours or font sizes of their own.
// Values go through NodeReadout and states through StatusBadge; colour and size come from CSS classes and tokens.
// The inspector Results views (components/details) follow the same rules, and they take numbers from the unit
// context formatters (no toFixed) and never use weight 800. Readout labels carry no trailing colon.
// A failure means moving the style into index.css, never loosening this test.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const NODES_DIR = join(here, '..', 'nodes');
const DETAILS_DIR = join(here, '..', 'components', 'details');

const RULES = [
  { name: 'hex colour', re: /#[0-9a-fA-F]{3,8}\b/ },
  { name: 'rgb/rgba colour', re: /\brgba?\s*\(/ },
  // style property or JSX attribute with a numeric size; `data.fontSize` (a data field) has no `:` or `=` after it
  { name: 'numeric fontSize', re: /\bfontSize\s*(?::|=)\s*(?:\{\s*)?['"]?\d/ },
];

// Extra rules for the inspector Results views only
const DETAILS_RULES = [
  { name: 'toFixed (use the unit context formatters)', re: /\.toFixed\(/ },
  { name: 'font weight 800', re: /\bfont-?[wW]eight\s*(?::|=)\s*(?:\{\s*)?['"]?800\b/ },
];

// A literal `label` (NodeReadout row) that ends in a colon, e.g. label: 'Flow:'
const LABEL_COLON = { name: 'readout label ends in a colon', re: /\blabel\s*(?::|=)\s*\{?\s*(['"`])[^'"`]*:\s*\1/ };

const check = (rules) => (line) => rules.filter((r) => r.re.test(line)).map((r) => r.name);
const violations = check(RULES);
const detailsViolations = check([...RULES, ...DETAILS_RULES]);
const nodeViolations = check([...RULES, LABEL_COLON]);

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

describe('style guard: matcher for details views and readout labels', () => {
  it.each([
    ['value.toFixed(2)', ['toFixed (use the unit context formatters)']],
    ["fontWeight: 800", ['font weight 800']],
    ["style={{ fontWeight: '800' }}", ['font weight 800']],
    ["fontWeight: 600", []],
    ["stroke: '#abc'", ['hex colour']],
    ['<Row value={formatPressurePa(p)} />', []],
  ])('details rule classifies %s', (line, expected) => {
    expect(detailsViolations(line)).toEqual(expected);
  });

  it.each([
    ["{ label: 'Flow:', value: q }", ['readout label ends in a colon']],
    ['{ label: "ΔP :", value: q }', ['readout label ends in a colon']],
    ["{ label: 'ΔP', value: q }", []],
    ["{ label: 'Set 10:30', value: q }", []],
    ["{ label: `Flow ${x}:`, value: q }", ['readout label ends in a colon']],
    ["{ value: q, unit: 'bar:' }", []],
  ])('node label rule classifies %s', (line, expected) => {
    expect(nodeViolations(line)).toEqual(expected);
  });
});

const PANELS_DIR = join(here, '..', 'components', 'panels');

const SCANS = [
  { dir: NODES_DIR, label: 'nodes', rules: nodeViolations, what: 'colour literal, numeric fontSize or readout label colon' },
  { dir: DETAILS_DIR, label: 'components/details', rules: detailsViolations, what: 'colour literal, numeric fontSize, toFixed or weight 800' },
  // Only the panels already cleaned up are listed; do not widen to the whole folder
  { dir: PANELS_DIR, label: 'components/panels', rules: violations, what: 'colour literal or numeric fontSize', only: ['MeasurementsTable.jsx'] },
];

describe('style guard: real source files', () => {
  it.each(SCANS)('no $label source file has a $what', ({ dir, label, rules, only }) => {
    const files = readdirSync(dir).filter((f) => /\.jsx?$/.test(f) && !/\.test\.jsx?$/.test(f) && (!only || only.includes(f)));
    expect(files.length, `no source files found in ${label}`).toBeGreaterThan(0);
    const problems = [];
    for (const file of files) {
      readFileSync(join(dir, file), 'utf8').split(/\r?\n/).forEach((line, i) => {
        for (const rule of rules(line)) problems.push(`${label}/${file}:${i + 1}: ${rule}: ${line.trim()}`);
      });
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
