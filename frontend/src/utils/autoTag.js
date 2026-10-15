// F3-13: readable default names for dropped components ("Centrifugal Pump 3"), numbered per type.

const TYPE_NAMES = {
  linear_control_valve: 'Control Valve',
  linear_regulator: 'Pressure Regulator',
  three_way_tcv: '3-Way Temp Valve',
  pressure_safety_valve: 'Safety Relief Valve',
  psv: 'Safety Relief Valve',
  text_bubble: 'Note',
  heat_exchanger: 'Cooler',
  check_valve_orifice: 'Check Valve w/ Orifice',
  calibrated_restriction: 'Calibrated Restriction',
};

export const typeDisplayName = (type) => TYPE_NAMES[type]
  || String(type || 'Component').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/** Next free "<Type name> <n>" given the labels already on the canvas. */
export const nextAutoTag = (type, existingLabels = []) => {
  const prefix = `${typeDisplayName(type)} `;
  let max = 0;
  existingLabels.forEach((label) => {
    const text = String(label ?? '').trim();
    if (!text.startsWith(prefix)) return;
    const rest = text.slice(prefix.length);
    if (rest !== '' && [...rest].every(ch => ch >= '0' && ch <= '9')) max = Math.max(max, Number(rest));
  });
  return `${prefix}${max + 1}`;
};
