import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import {
  UNIT_SYSTEMS,
  UNIT_LABELS,
  getUnitLabel,
  formatPressureFromBar,
  formatPressureFromPa,
  formatFlowFromLmin,
  formatFlowFromM3s,
  formatTempFromC,
  formatTempFromK,
  formatVelocityFromMs,
  formatPowerFromKw,
  barToPsi,
  psiToBar,
  paToPsi,
  psiToPa,
  lminToGpm,
  gpmToLmin,
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

const UnitContext = createContext({
  unitSystem: UNIT_SYSTEMS.METRIC,
  setUnitSystem: () => {},
  isImperial: false,
  isMetric: true,
  labels: UNIT_LABELS[UNIT_SYSTEMS.METRIC],
  getLabel: () => '',
  formatPressure: () => '',
  formatPressurePa: () => '',
  formatPressureGauge: () => '',
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

  const isImperial = unitSystem === UNIT_SYSTEMS.IMPERIAL;
  const isMetric = !isImperial;

  const labels = useMemo(() => UNIT_LABELS[unitSystem] || UNIT_LABELS[UNIT_SYSTEMS.METRIC], [unitSystem]);

  const getLabel = useCallback((quantity) => {
    return getUnitLabel(quantity, unitSystem);
  }, [unitSystem]);

  const formatPressure = useCallback((valBar, decimals = 2) => {
    return formatPressureFromBar(valBar, unitSystem, decimals);
  }, [unitSystem]);

  // Gauge pressure (relief set / burst pressure) with its unit: "18.99 barg" / "275.4 psig"
  const formatPressureGauge = useCallback((valBarg, decimals = 2) => {
    if (valBarg === null || valBarg === undefined || isNaN(valBarg)) return '—';
    return `${formatPressureFromBar(valBarg, unitSystem, unitSystem === UNIT_SYSTEMS.IMPERIAL ? 1 : decimals)} ${unitSystem === UNIT_SYSTEMS.IMPERIAL ? 'psig' : 'barg'}`;
  }, [unitSystem]);

  const formatPressurePa = useCallback((valPa, decimals = 2) => {
    return formatPressureFromPa(valPa, unitSystem, decimals);
  }, [unitSystem]);

  const formatFlow = useCallback((valLmin, decimals = 1) => {
    return formatFlowFromLmin(valLmin, unitSystem, decimals);
  }, [unitSystem]);

  const formatFlowM3s = useCallback((valM3s, decimals = 1) => {
    return formatFlowFromM3s(valM3s, unitSystem, decimals);
  }, [unitSystem]);

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
    
    if (!isImperial) return num;

    // Convert based on property name pattern
    switch (propKey) {
      // Flow rates (base: L/min)
      case 'flow_rated_lmin':
      case 'source_flow_lmin':
      case 'rated_flow_lmin':
      case 'flow_ref_lmin':
      case 'flow_base_lmin':
        return Number(lminToGpm(num, 2));

      // Pressures (base: bar)
      case 'set_pressure_barg':
      case 'design_superimposed_bp_barg':
      case 'burst_pressure_barg':
      case 'dp_clean_bar':
      case 'dp_terminal_bar':
      case 'rated_dp_bar':
      case 'inlet_pressure_base_bara':
      case 'outlet_pressure_base_bara':
      case 'source_pressure_bara':
      case 'max_discharge_pressure_bara':
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
        return num;
    }
  }, [isImperial]);

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

    if (!isImperial) return num;

    switch (propKey) {
      // Flow rates (input: GPM -> base: L/min)
      case 'flow_rated_lmin':
      case 'source_flow_lmin':
      case 'rated_flow_lmin':
      case 'flow_ref_lmin':
      case 'flow_base_lmin':
        return gpmToLmin(num);

      // Pressures (input: psi -> base: bar)
      case 'set_pressure_barg':
      case 'design_superimposed_bp_barg':
      case 'burst_pressure_barg':
      case 'dp_clean_bar':
      case 'dp_terminal_bar':
      case 'rated_dp_bar':
      case 'inlet_pressure_base_bara':
      case 'outlet_pressure_base_bara':
      case 'source_pressure_bara':
      case 'max_discharge_pressure_bara':
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
  }, [isImperial]);

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
