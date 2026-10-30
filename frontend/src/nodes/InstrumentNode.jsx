import { useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals } from 'reactflow';
import { useUnits } from '../context/UnitContext';
import { getRotatedPosition, RotateButton } from '../components/canvas/NodeRotationHandle';
import { instrumentLetters, formatReading } from '../utils/instrumentReadings';

const D = 42; // bubble height, and its width for a short tag; a longer tag only makes it wider

const handleStyle = {
  background: 'var(--color-warning)',
  width: '8px',
  height: '8px',
  border: '1.5px solid var(--color-brand-dark)',
};

// Puts the 10px handle centre on the bubble outline, on whichever side the rotation moved it to
const PIN_OFFSET = {
  [Position.Left]: { left: '-5px' },
  [Position.Right]: { right: '-5px' },
  [Position.Top]: { top: '-5px' },
  [Position.Bottom]: { bottom: '-5px' },
};

// The ΔP "+"/"−" mark sits just outside its pin
const MARK_OFFSET = {
  [Position.Left]: { left: '-14px', top: '6px' },
  [Position.Right]: { right: '-14px', top: '6px' },
  [Position.Top]: { top: '-16px', left: '6px' },
  [Position.Bottom]: { bottom: '-16px', left: '6px' },
};

const markStyle = { position: 'absolute', fontSize: 'var(--fs-xs)', fontWeight: 800, color: 'var(--color-text-secondary)' };

const BADGE = {
  HH: { bg: '#FEF2F2', border: 'var(--color-danger)', text: 'var(--color-danger-text)' },
  LL: { bg: '#FEF2F2', border: 'var(--color-danger)', text: 'var(--color-danger-text)' },
  H: { bg: 'var(--color-warning-bg)', border: 'var(--color-primary)', text: 'var(--color-primary-text)' },
  L: { bg: 'var(--color-warning-bg)', border: 'var(--color-primary)', text: 'var(--color-primary-text)' },
};

/** Loop number shown in the lower half: the tag without its leading letters ("PIT 12" -> "12"). */
const loopNumber = (tag, letters) => {
  const t = String(tag ?? '');
  return t.startsWith(letters) ? t.slice(letters.length).replace(/^[\s-]+/, '') : t;
};

/**
 * Instrument bubble (ISA 5.1 field instrument): shows one variable read at a sensing pin, with alarm colouring.
 * The reading comes from App (data.reading) so it follows the active case without a re-run.
 * Rotating moves the pins round the bubble; the text stays upright.
 */
export default function InstrumentNode({ id, data, selected }) {
  const { isImperial, flowUnit } = useUnits();
  const updateNodeInternals = useUpdateNodeInternals();
  const rotation = data.rotation || 0;
  const variable = data.variable || 'P';
  const letters = instrumentLetters(variable);
  const isDp = variable === 'dP';
  const state = data.reading?.state || null;
  const { text, unit } = formatReading(variable, data.reading?.value ?? null, data.pressure_basis, isImperial, flowUnit);
  const badge = BADGE[state] || { bg: 'var(--color-surface)', border: 'var(--color-border)', text: 'var(--color-brand-dark)' };
  const tag = data.label || letters;

  const inPos = getRotatedPosition(Position.Left, rotation);
  const refPos = getRotatedPosition(Position.Right, rotation);
  // The reading moves to the right of the bubble when a pin points down, so a signal line does not cross it
  const badgeRight = inPos === Position.Bottom || (isDp && refPos === Position.Bottom);

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, rotation, isDp, tag, updateNodeInternals]);

  return (
    <div style={{ position: 'relative', cursor: selected ? 'move' : 'pointer' }}>
      <RotateButton visible={selected} onClick={() => data.onRotate && data.onRotate(id)} />

      <div
        role="img"
        aria-label={`${tag}${state ? `, alarm ${state}` : ''}`}
        title={tag}
        style={{
          // A short tag gives a circle; a longer one stretches it sideways into a pill (half circles at the ends)
          position: 'relative', width: 'max-content', minWidth: D, height: D, padding: '0 12px',
          borderRadius: D / 2,
          background: 'var(--color-surface)',
          border: '2px solid var(--color-brand-dark)',
          boxShadow: selected ? '0 0 0 3px var(--color-primary-glow)' : 'var(--shadow-sm)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1.1, whiteSpace: 'nowrap', transition: 'box-shadow 0.15s ease',
        }}
      >
        <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 800, color: 'var(--color-brand-dark)' }}>{letters}</span>
        <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {loopNumber(tag, letters)}
        </span>

        <Handle type="target" position={inPos} id="signal-in" style={{ ...handleStyle, ...PIN_OFFSET[inPos] }} />
        {isDp && <Handle type="target" position={refPos} id="signal-in-ref" style={{ ...handleStyle, ...PIN_OFFSET[refPos] }} />}
        {isDp && (
          <>
            <span aria-hidden style={{ ...markStyle, ...MARK_OFFSET[inPos] }}>+</span>
            <span aria-hidden style={{ ...markStyle, ...MARK_OFFSET[refPos] }}>−</span>
          </>
        )}
      </div>

      <div style={{
        position: 'absolute',
        ...(badgeRight
          ? { left: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' }
          : { top: 'calc(100% + 4px)', left: '50%', transform: 'translateX(-50%)' }),
        display: 'flex', alignItems: 'baseline', gap: '4px', whiteSpace: 'nowrap',
        padding: '1px 6px', borderRadius: 'var(--radius-sm)',
        background: badge.bg, border: `1px solid ${badge.border}`, color: badge.text,
        fontSize: 'var(--fs-xs)', fontWeight: 700, fontFamily: 'var(--font-mono)',
      }}>
        {state && <span>{state}</span>}
        <span>{text}</span>
        <span style={{ fontWeight: 500 }}>{unit}</span>
      </div>
    </div>
  );
}
