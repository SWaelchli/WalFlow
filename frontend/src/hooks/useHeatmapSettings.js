import { useState, useCallback, useMemo } from 'react';
import { computeHeatmapRange } from '../utils/heatmapRange';

/** Pipe heatmap: mode, scale settings and the colour range that results from them. */
export function useHeatmapSettings({ edges, cases, activeCaseId, telemetryMode }) {
  const [heatmapSettings, setHeatmapSettings] = useState({
    mode: 'default',
    autoScale: true,
    globalAutoScale: true,
    customRanges: {
      pressure: { min: 0.0, max: 6.0 },
      temperature: { min: 20.0, max: 60.0 },
      volumeflow: { min: 0.0, max: 200.0 },
      velocity: { min: 0.0, max: 10.0 }
    }
  });

  // Range for the "reset / switch to custom" buttons: all cases, rounded to 0.1
  const computeGlobalHeatmapRange = useCallback((mode) => computeHeatmapRange({
    edges, cases, activeCaseId, telemetryMode, mode, allCases: true, round: true,
  }), [edges, cases, activeCaseId, telemetryMode]);

  const computedHeatmapRange = useMemo(() => {
    const mode = heatmapSettings.mode;
    if (mode !== 'default' && !heatmapSettings.autoScale) {
      return heatmapSettings.customRanges[mode] || { min: 0, max: 10 };
    }
    return computeHeatmapRange({
      edges, cases, activeCaseId, telemetryMode, mode, allCases: heatmapSettings.globalAutoScale,
    });
  }, [edges, cases, activeCaseId, telemetryMode, heatmapSettings.mode, heatmapSettings.autoScale, heatmapSettings.globalAutoScale, heatmapSettings.customRanges]);

  return { heatmapSettings, setHeatmapSettings, computeGlobalHeatmapRange, computedHeatmapRange };
}

export default useHeatmapSettings;
