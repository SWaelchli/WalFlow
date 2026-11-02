// Tone of a utilisation bar (capacity used): above 100 % danger, above 80 % warning
export const utilisationTone = (pct) => (pct > 100 ? 'danger' : (pct > 80 ? 'warning' : 'success'));
