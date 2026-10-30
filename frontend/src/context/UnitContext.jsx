import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import {
  UNIT_SYSTEMS,
  UNIT_LABELS,
  getUnitLabel,
  formatAbsPressureFromBar,
  formatAbsPressureFromPa,
  formatDiffPressureFromBar,
  formatDiffPressureFromPa,
  formatGaugeBarWithUnit,
  formatFlowFromLmin,
  PRESSURE_BASES,
  FLOW_UNITS,
  DEFAULT_ATM_PA,
  normalizePressureBasis,
  normalizeFlowUnit,
  pressureBasisLabel,
  flowUnitLabel,
  absPaToDisplayPressure,
  displayPressureToAbsPa,
  lminToDisplayFlow,
  displayFlowToLmin,
  BAR_TO_PA,
  formatFlowFromM3s,
  formatTempFromC,
  formatTempFromK,
  formatVelocityFromMs,
  formatPowerFromKw,
  barToPsi,
  psiToBar,
  paToPsi,
  psiToPa,
  cToF,
  fToC,
  cToK,
  fToK,
  kwToHp,
  kwToBtuh,
  btuhToKw,
  formatHeatDutyFromKw,
  hpToKw,
  mToFt,
  ftToM,
  inToM,
  mmToM
} from '../utils/converters';

const STORAGE_KEY = 'walflow_unit_system';
const BASIS_STORAGE_KEY = 'walflow_pressure_basis';
const FLOW_STORAGE_KEY = 'walflow_flow_unit';

const readStored = (key, allowed, fallback) => {
  try {
    const stored = localStorage.getItem(key);
    if (stored && Object.values(allowed).includes(stored)) return stored;
  } catch {
    // localStorage not accessible
  }
  return fallback;
};

const writeStored = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
};

// Absolute-pressure properties (stored in bar absolute, or Pa absolute): shown in the chosen basis
const ABS_BAR_KEYS = new Set([
  'set_pressure_bara',
  'min_suction_pressure_bara',
  'max_discharge_pressure_bara',
  'inlet_pressure_base_bara',
  'outlet_pressure_base_bara',
]);
const ABS_PA_KEYS = new Set(['set_pressure_pa']);
// Flow properties (stored in L/min): shown in the active flow unit
const FLOW_KEYS = new Set(['flow_rated_lmin', 'set_flow_lmin', 'rated_flow_lmin', 'flow_ref_lmin', 'flow_base_lmin']);

// Trim float noise from converted values (9.213249999999999 -> 9.21325)
const trimNoise = (v, digits = 10) => Number(Number(v).toPrecision(digits));

const UnitContext = createContext({
  unitSystem: UNIT_SYSTEMS.METRIC,
  setUnitSystem: () => {},
  isImperial: false,
  isMetric: true,
  labels: UNIT_LABELS[UNIT_SYSTEMS.METRIC],
  getLabel: () => '',
  pressureBasis: PRESSURE_BASES.ABSOLUTE,
  setPressureBasis: () => {},
  flowUnit: FLOW_UNITS.LMIN,
  setFlowUnit: () => {},
  atmosphericPa: DEFAULT_ATM_PA,
  setAtmosphericPressure: () => {},
  basisLabel: 'bar a',
  gaugeLabel: 'bar g',
  formatPressure: () => '',
  formatPressurePa: () => '',
  formatDiffPressure: () => '',
  formatDiffPressurePa: () => '',
  formatPressureGauge: () => '',
  absPaToDisplay: () => null,
  displayToAbsPa: () => 0,
  lminToDisplay: () => null,
  displayToLmin: () => 0,
  formatFlow: () => '',
  formatFlowM3s: () => '',
  formatTemperature: () => '',
  formatTemperatureK: () => '',
  formatVelocity: () => '',
  formatPower: () => '',
  formatHeatDuty: () => '',
  toDisplayValue: () => '',
  fromInputValue: () => 0,
  smallLengthToM: () => 0
});

export function UnitProvider({ children, initialUnitSystem, onUnitSystemChange }) {
  const [unitSystem, setUnitSystemState] = useState(() => {
    if (initialUnitSystem && Object.values(UNIT_SYSTEMS).includes(initialUnitSystem)) {
      return initialUnitSystem;
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && Object.values(UNIT_SYSTEMS).includes(stored)) {
        return stored;
      }
    } catch {
      // localStorage not accessible
    }
    return UNIT_SYSTEMS.METRIC;
  });

  const [prevInitial, setPrevInitial] = useState(initialUnitSystem);
  if (initialUnitSystem && initialUnitSystem !== prevInitial && Object.values(UNIT_SYSTEMS).includes(initialUnitSystem)) {
    setPrevInitial(initialUnitSystem);
    setUnitSystemState(initialUnitSystem);
  }

  const setUnitSystem = useCallback((newSystem) => {
    if (!Object.values(UNIT_SYSTEMS).includes(newSystem)) return;
    setUnitSystemState(newSystem);
    try {
      localStorage.setItem(STORAGE_KEY, newSystem);
    } catch {
      // ignore storage errors
    }
    if (onUnitSystemChange) {
      onUnitSystemChange(newSystem);
    }
  }, [onUnitSystemChange]);

  const [pressureBasis, setPressureBasisState] = useState(() => readStored(BASIS_STORAGE_KEY, PRESSURE_BASES, PRESSURE_BASES.ABSOLUTE));
  const [flowUnit, setFlowUnitState] = useState(() => readStored(FLOW_STORAGE_KEY, FLOW_UNITS, FLOW_UNITS.LMIN));
  // Site atmospheric pressure of the open drawing (Pa): the offset between absolute and gauge
  const [atmosphericPa, setAtmosphericPa] = useState(DEFAULT_ATM_PA);

  const setPressureBasis = useCallback((basis) => {
    const next = normalizePressureBasis(basis);
    setPressureBasisState(next);
    writeStored(BASIS_STORAGE_KEY, next);
  }, []);

  const setFlowUnit = useCallback((unit) => {
    const next = normalizeFlowUnit(unit);
    setFlowUnitState(next);
    writeStored(FLOW_STORAGE_KEY, next);
  }, []);

  const setAtmosphericPressure = useCallback((pa) => {
    const n = Number(pa);
    setAtmosphericPa(Number.isFinite(n) && n > 0 ? n : DEFAULT_ATM_PA);
  }, []);

  const isImperial = unitSystem === UNIT_SYSTEMS.IMPERIAL;
  const isMetric = !isImperial;

  const basisLabel = pressureBasisLabel(unitSystem, pressureBasis);
  const gaugeLabel = pressureBasisLabel(unitSystem, PRESSURE_BASES.GAUGE);
  const flowLabel = flowUnitLabel(unitSystem, flowUnit);

  // pressureAbs follows the chosen basis; flow follows the chosen flow unit
  const labels = useMemo(() => ({
    ...(UNIT_LABELS[unitSystem] || UNIT_LABELS[UNIT_SYSTEMS.METRIC]),
    pressureAbs: basisLabel,
    flow: flowLabel,
  }), [unitSystem, basisLabel, flowLabel]);

  const getLabel = useCallback((quantity) => {
    return getUnitLabel(quantity, unitSystem);
  }, [unitSystem]);

  // Absolute pressures follow the basis; differences (formatDiffPressure*) never get the atmospheric offset
  const formatPressure = useCallback((valBar, decimals = 2) => {
    return formatAbsPressureFromBar(valBar, unitSystem, pressureBasis, atmosphericPa, decimals);
  }, [unitSystem, pressureBasis, atmosphericPa]);

  const formatPressurePa = useCallback((valPa, decimals = 2) => {
    return formatAbsPressureFromPa(valPa, unitSystem, pressureBasis, atmosphericPa, decimals);
  }, [unitSystem, pressureBasis, atmosphericPa]);

  const formatDiffPressure = useCallback((valBar, decimals = 2) => {
    return formatDiffPressureFromBar(valBar, unitSystem, decimals);
  }, [unitSystem]);

  const formatDiffPressurePa = useCallback((valPa, decimals = 2) => {
    return formatDiffPressureFromPa(valPa, unitSystem, decimals);
  }, [unitSystem]);

  // Gauge-only pressure (relief set / burst pressure) with its unit: "18.99 bar g" / "275.4 psig"
  const formatPressureGauge = useCallback((valBarg, decimals = 2) => {
    return formatGaugeBarWithUnit(valBarg, unitSystem, decimals);
  }, [unitSystem]);

  // Absolute Pa <-> number in the display unit and the chosen basis
  const absPaToDisplay = useCallback((pa) => {
    return absPaToDisplayPressure(pa, { unitSystem, basis: pressureBasis, atmPa: atmosphericPa });
  }, [unitSystem, pressureBasis, atmosphericPa]);

  const displayToAbsPa = useCallback((value) => {
    return displayPressureToAbsPa(value, { unitSystem, basis: pressureBasis, atmPa: atmosphericPa });
  }, [unitSystem, pressureBasis, atmosphericPa]);

  const lminToDisplay = useCallback((lmin) => lminToDisplayFlow(lmin, unitSystem, flowUnit), [unitSystem, flowUnit]);
  const displayToLmin = useCallback((value) => displayFlowToLmin(value, unitSystem, flowUnit), [unitSystem, flowUnit]);

  const formatFlow = useCallback((valLmin, decimals) => {
    return formatFlowFromLmin(valLmin, unitSystem, decimals, flowUnit);
  }, [unitSystem, flowUnit]);

  const formatFlowM3s = useCallback((valM3s, decimals) => {
    return formatFlowFromM3s(valM3s, unitSystem, decimals, flowUnit);
  }, [unitSystem, flowUnit]);

  const formatTemperature = useCallback((valC, decimals = 1) => {
    return formatTempFromC(valC, unitSystem, decimals);
  }, [unitSystem]);

  const formatTemperatureK = useCallback((valK, decimals = 1) => {
    return formatTempFromK(valK, unitSystem, decimals);
  }, [unitSystem]);

  const formatVelocity = useCallback((valMs, decimals = 2) => {
    return formatVelocityFromMs(valMs, unitSystem, decimals);
  }, [unitSystem]);

  const formatPower = useCallback((valKw, decimals = 2) => {
    return formatPowerFromKw(valKw, unitSystem, decimals);
  }, [unitSystem]);

  const formatHeatDuty = useCallback((valKw, decimals = 1) => {
    return formatHeatDutyFromKw(valKw, unitSystem, decimals);
  }, [unitSystem]);

  /**
   * Convert a base Metric property value to a display value string for property editors.
   */
  const toDisplayValue = useCallback((propKey, baseValue) => {
    if (baseValue === undefined || baseValue === null || isNaN(baseValue)) return '';
    const num = Number(baseValue);
    
    // Handle Kelvin temperature conversion (base is Kelvin, display is always Celsius or Fahrenheit)
    if (propKey === 'temperature_k') {
      return isImperial ? Number(((num - 273.15) * 1.8 + 32).toFixed(1)) : Number((num - 273.15).toFixed(1));
    }
    
    // Absolute pressures: shown in the chosen basis
    if (ABS_BAR_KEYS.has(propKey) || ABS_PA_KEYS.has(propKey)) {
      const isPa = ABS_PA_KEYS.has(propKey);
      const shown = absPaToDisplay(isPa ? num : num * BAR_TO_PA);
      if (isImperial) return Number(shown.toFixed(2));
      if (pressureBasis === PRESSURE_BASES.GAUGE) return Number(shown.toFixed(5));
      return isPa ? Number(shown.toFixed(3)) : trimNoise(num);
    }

    // Flow rates (base: L/min): shown in the active flow unit
    if (FLOW_KEYS.has(propKey)) {
      const shown = lminToDisplay(num);
      if (isImperial) return Number(shown.toFixed(2));
      return flowUnit === FLOW_UNITS.M3H ? Number(shown.toFixed(4)) : trimNoise(num);
    }

    if (!isImperial) return trimNoise(num);

    // Convert based on property name pattern
    switch (propKey) {
      // Pressures (base: bar). Gauge-only and differential values carry no atmospheric offset.
      case 'set_pressure_barg':
      case 'design_superimposed_bp_barg':
      case 'burst_pressure_barg':
      case 'dp_clean_bar':
      case 'dp_terminal_bar':
      case 'rated_dp_bar':
      case 'cracking_pressure_bar':
        return Number(barToPsi(num, 2));

      // Pressure in Pa (base: Pa)
      case 'pressure':
      case 'atmospheric_pressure':
        return Number(paToPsi(num, 2));

      // Temperature (base: °C)
      case 'set_temperature_c':
      case 'design_inlet_temp_c':
      case 'design_outlet_temp_c':
      case 'medium_temp_c':
      case 'temp_base_c':
        return Number(cToF(num, 1));

      // Power (base: kW)
      case 'motor_power_kw':
        return Number(kwToHp(num, 2));

      // Heat duty (base: kW)
      case 'rated_cooling_kw':
        return Number(kwToBtuh(num, 0));

      // Pipe Length, Level, Elevation (base: m)
      case 'head_rated_m':
      case 'npshr_m':
      case 'npsh_margin_m':
      case 'length_m':
      case 'level_m':
      case 'elevation_m':
        return Number(mToFt(num, 2));

      // Pipe Diameter (base: m)
      case 'diameter_m':
        return Number((num * 39.37007874).toFixed(3));

      default:
        return trimNoise(num);
    }
  }, [isImperial, pressureBasis, flowUnit, absPaToDisplay, lminToDisplay]);

  /**
   * Convert an input string/number entered by the user in the active unit system
   * back to the base Metric unit before saving into node/edge state.
   */
  const fromInputValue = useCallback((propKey, inputValue) => {
    if (inputValue === undefined || inputValue === null) return 0;
    if (typeof inputValue === 'boolean' || typeof inputValue === 'object') return inputValue;

    const stringKeys = ['label', 'pipe_class_id', 'pipe_class_code', 'standardSch', 'material_grade'];
    if (stringKeys.includes(propKey)) {
      return inputValue !== undefined && inputValue !== null ? inputValue : '';
    }

    if (inputValue === '') return 0;
    const num = parseFloat(inputValue);
    if (isNaN(num)) return 0;

    // Handle Kelvin temperature conversion (input is always Celsius or Fahrenheit, base is Kelvin)
    if (propKey === 'temperature_k') {
      return isImperial ? fToK(num) : cToK(num);
    }

    // Absolute pressures typed in the chosen basis -> absolute, in the stored unit (bar or Pa)
    // Rounded to 1e-6 bar (0.1 Pa) so gauge input does not leave float noise in the stored absolute value
    if (ABS_BAR_KEYS.has(propKey)) return Math.round(displayToAbsPa(num) * 10) / 10 / BAR_TO_PA;
    if (ABS_PA_KEYS.has(propKey)) return Math.round(displayToAbsPa(num) * 10) / 10;

    // Flow rates typed in the active flow unit -> L/min
    if (FLOW_KEYS.has(propKey)) return trimNoise(displayToLmin(num), 12);

    if (!isImperial) return num;

    switch (propKey) {
      // Pressures (input: psi -> base: bar). Gauge-only and differential values carry no atmospheric offset.
      case 'set_pressure_barg':
      case 'design_superimposed_bp_barg':
      case 'burst_pressure_barg':
      case 'dp_clean_bar':
      case 'dp_terminal_bar':
      case 'rated_dp_bar':
      case 'cracking_pressure_bar':
        return psiToBar(num);

      // Pressure in Pa (input: psi -> base: Pa)
      case 'pressure':
      case 'atmospheric_pressure':
        return psiToPa(num);

      // Temperature (input: °F -> base: °C)
      case 'set_temperature_c':
      case 'design_inlet_temp_c':
      case 'design_outlet_temp_c':
      case 'medium_temp_c':
      case 'temp_base_c':
        return fToC(num);

      // Power (input: HP -> base: kW)
      case 'motor_power_kw':
        return hpToKw(num);

      // Heat duty (input: BTU/h -> base: kW)
      case 'rated_cooling_kw':
        return btuhToKw(num);

      // Pipe Length, Level, Elevation (input: ft -> base: m)
      case 'head_rated_m':
      case 'npshr_m':
      case 'npsh_margin_m':
      case 'length_m':
      case 'level_m':
      case 'elevation_m':
        return ftToM(num);

      // Pipe Diameter (input: in -> base: m)
      case 'diameter_m':
        return inToM(num);

      default:
        return num;
    }
  }, [isImperial, displayToAbsPa, displayToLmin]);

  /**
   * Convert a small length typed in mm (metric) or inches (imperial), e.g. fitting bores and
   * reducer lengths, to metres.
   */
  const smallLengthToM = useCallback((inputValue) => (isImperial ? inToM(inputValue) : mmToM(inputValue)), [isImperial]);

  const value = useMemo(() => ({
    unitSystem,
    setUnitSystem,
    isImperial,
    isMetric,
    labels,
    getLabel,
    formatPressure,
    formatPressurePa,
    formatPressureGauge,
    formatDiffPressure,
    formatDiffPressurePa,
    pressureBasis,
    setPressureBasis,
    flowUnit,
    setFlowUnit,
    atmosphericPa,
    setAtmosphericPressure,
    basisLabel,
    gaugeLabel,
    absPaToDisplay,
    displayToAbsPa,
    lminToDisplay,
    displayToLmin,
    formatFlow,
    formatFlowM3s,
    formatTemperature,
    formatTemperatureK,
    formatVelocity,
    formatPower,
    formatHeatDuty,
    toDisplayValue,
    fromInputValue,
    smallLengthToM
  }), [
    unitSystem,
    setUnitSystem,
    isImperial,
    isMetric,
    labels,
    getLabel,
    formatPressure,
    formatPressurePa,
    formatPressureGauge,
    formatDiffPressure,
    formatDiffPressurePa,
    pressureBasis,
    setPressureBasis,
    flowUnit,
    setFlowUnit,
    atmosphericPa,
    setAtmosphericPressure,
    basisLabel,
    gaugeLabel,
    absPaToDisplay,
    displayToAbsPa,
    lminToDisplay,
    displayToLmin,
    formatFlow,
    formatFlowM3s,
    formatTemperature,
    formatTemperatureK,
    formatVelocity,
    formatPower,
    formatHeatDuty,
    toDisplayValue,
    fromInputValue,
    smallLengthToM
  ]);

  return (
    <UnitContext.Provider value={value}>
      {children}
    </UnitContext.Provider>
  );
}

/* eslint-disable-next-line react-refresh/only-export-components */
export function useUnits() {
  return useContext(UnitContext);
}

export default UnitContext;
