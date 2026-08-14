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
  kwToHp,
  hpToKw,
  mToFt,
  ftToM,
  inToM
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
  formatFlow: () => '',
  formatFlowM3s: () => '',
  formatTemperature: () => '',
  formatTemperatureK: () => '',
  formatVelocity: () => '',
  formatPower: () => '',
  toDisplayValue: () => '',
  fromInputValue: () => 0
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

  /**
   * Convert a base Metric property value to a display value string for property editors.
   */
  const toDisplayValue = useCallback((propKey, baseValue) => {
    if (baseValue === undefined || baseValue === null || isNaN(baseValue)) return '';
    const num = Number(baseValue);
    if (!isImperial) return num;

    // Convert based on property name pattern
    switch (propKey) {
      // Flow rates (base: L/min)
      case 'flow_rated_lmin':
      case 'flow_rated':
      case 'source_flow_lmin':
      case 'rated_flow_lmin':
      case 'flow_ref':
      case 'flow_base_lmin':
        return Number(lminToGpm(num, 2));

      // Pressures (base: bar)
      case 'pressure_rated_bar':
      case 'pressure_rated':
      case 'set_pressure_bar':
      case 'burst_pressure_bar':
      case 'backpressure_bar':
      case 'dp_clean_bar':
      case 'dp_terminal_bar':
      case 'rated_dp_bar':
      case 'inlet_pressure_base_bar':
      case 'outlet_pressure_base_bar':
      case 'set_pressure':
        return Number(barToPsi(num, 2));

      // Pressure in Pa (base: Pa)
      case 'pressure':
      case 'atmospheric_pressure':
        return Number(paToPsi(num, 2));

      // Temperature (base: °C)
      case 'temperature':
      case 'temp_setpoint_c':
      case 'inlet_temp_c':
        return Number(cToF(num, 1));

      // Power (base: kW)
      case 'motor_power':
      case 'heat_duty_kw':
        return Number(kwToHp(num, 2));

      // Pipe Length (base: m)
      case 'length':
        return Number(mToFt(num, 2));

      // Pipe Diameter (base: m)
      case 'diameter':
        return Number((num * 39.37007874).toFixed(3));

      // Global pipe roughness (base: m)
      case 'global_roughness':
      case 'roughness':
        return Number((num * 39.37007874).toFixed(6));

      default:
        return num;
    }
  }, [isImperial]);

  /**
   * Convert an input string/number entered by the user in the active unit system
   * back to the base Metric unit before saving into node/edge state.
   */
  const fromInputValue = useCallback((propKey, inputValue) => {
    if (inputValue === undefined || inputValue === null || inputValue === '') return 0;
    const num = parseFloat(inputValue);
    if (isNaN(num)) return 0;
    if (!isImperial) return num;

    switch (propKey) {
      // Flow rates (input: GPM -> base: L/min)
      case 'flow_rated_lmin':
      case 'flow_rated':
      case 'source_flow_lmin':
      case 'rated_flow_lmin':
      case 'flow_ref':
      case 'flow_base_lmin':
        return gpmToLmin(num);

      // Pressures (input: psi -> base: bar)
      case 'pressure_rated_bar':
      case 'pressure_rated':
      case 'set_pressure_bar':
      case 'burst_pressure_bar':
      case 'backpressure_bar':
      case 'dp_clean_bar':
      case 'dp_terminal_bar':
      case 'rated_dp_bar':
      case 'inlet_pressure_base_bar':
      case 'outlet_pressure_base_bar':
      case 'set_pressure':
        return psiToBar(num);

      // Pressure in Pa (input: psi -> base: Pa)
      case 'pressure':
      case 'atmospheric_pressure':
        return psiToPa(num);

      // Temperature (input: °F -> base: °C)
      case 'temperature':
      case 'temp_setpoint_c':
      case 'inlet_temp_c':
        return fToC(num);

      // Power (input: HP -> base: kW)
      case 'motor_power':
      case 'heat_duty_kw':
        return hpToKw(num);

      // Pipe Length (input: ft -> base: m)
      case 'length':
        return ftToM(num);

      // Pipe Diameter (input: in -> base: m)
      case 'diameter':
        return inToM(num);

      // Pipe roughness (input: in -> base: m)
      case 'global_roughness':
      case 'roughness':
        return inToM(num);

      default:
        return num;
    }
  }, [isImperial]);

  const value = useMemo(() => ({
    unitSystem,
    setUnitSystem,
    isImperial,
    isMetric,
    labels,
    getLabel,
    formatPressure,
    formatPressurePa,
    formatFlow,
    formatFlowM3s,
    formatTemperature,
    formatTemperatureK,
    formatVelocity,
    formatPower,
    toDisplayValue,
    fromInputValue
  }), [
    unitSystem,
    setUnitSystem,
    isImperial,
    isMetric,
    labels,
    getLabel,
    formatPressure,
    formatPressurePa,
    formatFlow,
    formatFlowM3s,
    formatTemperature,
    formatTemperatureK,
    formatVelocity,
    formatPower,
    toDisplayValue,
    fromInputValue
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
