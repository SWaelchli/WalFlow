import { describe, it, expect } from 'vitest';
import { csvEscape, buildCsv, sanitizeFileSegment, buildCsvFileName } from './csvExport';

// Minimal RFC 4180 reader for the round-trip check
const parseCsv = (text) => {
  const rows = [[]];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { rows.at(-1).push(field); field = ''; }
    else if (ch === '\r' && text[i + 1] === '\n') { rows.at(-1).push(field); field = ''; rows.push([]); i++; }
    else field += ch;
  }
  rows.at(-1).push(field);
  return rows;
};

describe('csvEscape', () => {
  it.each([
    ['plain', 'Pump', 'Pump'],
    ['comma', 'a,b', '"a,b"'],
    ['quote', 'say "hi"', '"say ""hi"""'],
    ['newline', 'a\nb', '"a\nb"'],
    ['carriage return', 'a\rb', '"a\rb"'],
    ['null', null, ''],
    ['undefined', undefined, ''],
    ['number', 12.5, '12.5'],
    ['zero', 0, '0'],
    ['formula prefix =', '=SUM(A1)', "'=SUM(A1)"],
    ['formula prefix @', '@x', "'@x"],
    ['formula prefix +', '+cmd', "'+cmd"],
    ['formula prefix -', '-x', "'-x"],
    ['negative decimal string stays', '-1.23', '-1.23'],
    ['signed integer string stays', '+3', '+3'],
    ['exponent string stays', '1e-5', '1e-5'],
    ['negative number type stays', -5, '-5'],
    ['formula prefix and quoting', '=HYPERLINK("a","b")', `"'=HYPERLINK(""a"",""b"")"`],
  ])('%s', (_, value, expected) => {
    expect(csvEscape(value)).toBe(expected);
  });
});

describe('buildCsv', () => {
  it('starts with a BOM, separates rows with CRLF and has no trailing newline', () => {
    const text = buildCsv(['A', 'B'], [[1, 2], [3, 4]]);
    expect(text).toBe('﻿A,B\r\n1,2\r\n3,4');
  });

  it('escapes headers as well', () => {
    expect(buildCsv(['Flow (L/min), total'], [])).toBe('﻿"Flow (L/min), total"');
  });

  it('keeps awkward values intact through a CSV parse', () => {
    const rows = [['P-1, "main"', 'line1\nline2', null], [7, '', 'x']];
    const parsed = parseCsv(buildCsv(['Name', 'Note', 'Empty'], rows).slice(1));
    expect(parsed).toEqual([['Name', 'Note', 'Empty'], ['P-1, "main"', 'line1\nline2', ''], ['7', '', 'x']]);
  });
});

describe('buildCsvFileName', () => {
  it.each([
    ['plain name', 'Case 2', 'pipes', 'walflow_export_Case-2_pipes.csv'],
    ['reserved characters', 'a/b:c*d?', 'all', 'walflow_export_a-b-c-d_all.csv'],
    ['quotes, brackets and pipes', 'x"<y>|z', 'cases', 'walflow_export_x-y-z_cases.csv'],
    ['empty name', '', 'pipes', 'walflow_export_pipes.csv'],
    ['whitespace only name', '   ', 'pipes', 'walflow_export_pipes.csv'],
    ['missing name', undefined, 'pipes', 'walflow_export_pipes.csv'],
  ])('%s', (_, name, tab, expected) => {
    expect(buildCsvFileName(name, tab)).toBe(expected);
  });

  it.each([
    ['control character and spaces', 'a\u0001b  c', 'a-b-c'],
    ['tab between spaces', 'b \t c', 'b-c'],
    ['surrounding slashes', '/Case 2/', 'Case-2'],
  ])('sanitizeFileSegment: %s', (_, name, expected) => {
    expect(sanitizeFileSegment(name)).toBe(expected);
  });
});
