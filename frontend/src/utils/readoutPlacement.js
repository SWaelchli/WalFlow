// Where a node's readout (name and values) sits relative to its symbol.
// Below the symbol by default. On a node turned by 90 or 270 degrees the vertical pipe runs would cross a readout
// below it, so it moves beside the symbol: right when no port faces right, else left when no port faces left,
// else it stays below.

export const READOUT_GAP = 5;

/**
 * @param {number} rotation node rotation in degrees
 * @param {string[]} facingSides sides ('left', 'right', 'top', 'bottom') that a port or signal pin faces on screen
 * @returns {'below'|'right'|'left'}
 */
export function readoutSide(rotation = 0, facingSides = []) {
  const r = (((Math.round(rotation) % 360) + 360) % 360);
  if (r !== 90 && r !== 270) return 'below';
  if (!facingSides.includes('right')) return 'right';
  if (!facingSides.includes('left')) return 'left';
  return 'below';
}

/**
 * Inline style that puts a readout beside a symbol of `height` px (before rotation) turned by 90 or 270 degrees.
 * The symbol then spans height / 2 px either side of the box centre.
 */
export function sideReadoutStyle(side, height) {
  const edge = `calc(50% + ${height / 2 + READOUT_GAP}px)`;
  return {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    ...(side === 'right' ? { left: edge } : { right: edge }),
    width: 'max-content', textAlign: 'center',
  };
}
