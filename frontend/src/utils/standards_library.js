/**
 * WalFlow Standards Library
 * 
 * This file contains engineering standards and reference data.
 * Includes ASME B36.10M (Carbon Steel) and B36.19M (Stainless Steel) Pipe Dimensions.
 * 
 * Values are in mm unless otherwise specified.
 */

export const ASME_PIPE_STANDARDS = [
  { dn: 15, nps: "1/2", od: 21.3, schedules: { "5s": 1.65, "10s": 2.11, "40s": 2.77, "40": 2.77, "STD": 2.77, "80s": 3.73, "80": 3.73, "XS": 3.73 } },
  { dn: 20, nps: "3/4", od: 26.7, schedules: { "5s": 1.65, "10s": 2.11, "40s": 2.87, "40": 2.87, "STD": 2.87, "80s": 3.91, "80": 3.91, "XS": 3.91 } },
  { dn: 25, nps: "1", od: 33.4, schedules: { "5s": 1.65, "10s": 2.77, "40s": 3.38, "40": 3.38, "STD": 3.38, "80s": 4.55, "80": 4.55, "XS": 4.55 } },
  { dn: 32, nps: "1 1/4", od: 42.2, schedules: { "5s": 1.65, "10s": 2.77, "40s": 3.56, "40": 3.56, "STD": 3.56, "80s": 4.85, "80": 4.85, "XS": 4.85 } },
  { dn: 40, nps: "1 1/2", od: 48.3, schedules: { "5s": 1.65, "10s": 2.77, "40s": 3.68, "40": 3.68, "STD": 3.68, "80s": 5.08, "80": 5.08, "XS": 5.08 } },
  { dn: 50, nps: "2", od: 60.3, schedules: { "5s": 1.65, "10s": 2.77, "40s": 3.91, "40": 3.91, "STD": 3.91, "80s": 5.54, "80": 5.54, "XS": 5.54 } },
  { dn: 65, nps: "2 1/2", od: 73.0, schedules: { "5s": 2.11, "10s": 3.05, "40s": 5.16, "40": 5.16, "STD": 5.16, "80s": 7.01, "80": 7.01, "XS": 7.01 } },
  { dn: 80, nps: "3", od: 88.9, schedules: { "5s": 2.11, "10s": 3.05, "40s": 5.49, "40": 5.49, "STD": 5.49, "80s": 7.62, "80": 7.62, "XS": 7.62 } },
  { dn: 100, nps: "4", od: 114.3, schedules: { "5s": 2.11, "10s": 3.05, "40s": 6.02, "40": 6.02, "STD": 6.02, "80s": 8.56, "80": 8.56, "XS": 8.56 } },
  { dn: 125, nps: "5", od: 141.3, schedules: { "5s": 2.77, "10s": 3.40, "40s": 6.55, "40": 6.55, "STD": 6.55, "80s": 9.53, "80": 9.53, "XS": 9.53 } },
  { dn: 150, nps: "6", od: 168.3, schedules: { "5s": 2.77, "10s": 3.40, "40s": 7.11, "40": 7.11, "STD": 7.11, "80s": 10.97, "80": 10.97, "XS": 10.97 } },
  { dn: 200, nps: "8", od: 219.1, schedules: { "5s": 2.77, "10s": 3.76, "20": 6.35, "30": 7.04, "40s": 8.18, "40": 8.18, "STD": 8.18, "60": 10.31, "80s": 12.70, "80": 12.70, "XS": 12.70 } },
  { dn: 250, nps: "10", od: 273.0, schedules: { "5s": 3.40, "10s": 4.19, "20": 6.35, "30": 7.80, "40s": 9.27, "40": 9.27, "STD": 9.27, "60": 12.70, "80s": 12.70, "80": 15.09, "XS": 12.70 } },
  { dn: 300, nps: "12", od: 323.8, schedules: { "5s": 3.96, "10s": 4.57, "20": 6.35, "30": 8.38, "40s": 9.53, "40": 10.31, "STD": 9.53, "60": 14.27, "80s": 12.70, "80": 17.48, "XS": 12.70 } },
  { dn: 350, nps: "14", od: 355.6, schedules: { "10": 6.35, "10s": 4.78, "20": 7.92, "30": 9.53, "40": 11.13, "STD": 9.53, "60": 15.09, "80": 19.05, "XS": 12.70 } },
  { dn: 400, nps: "16", od: 406.4, schedules: { "10": 6.35, "10s": 4.78, "20": 9.53, "30": 12.70, "40": 12.70, "STD": 9.53, "60": 16.66, "80": 21.44, "XS": 12.70 } }
];

/**
 * Calculates Internal Diameter (ID) in meters.
 * @param {number} od Outer Diameter in mm
 * @param {number} wt Wall Thickness in mm
 * @returns {number} ID in meters
 */
export const calculatePipeId = (od, wt) => {
  return (od - 2 * wt) / 1000;
};

/**
 * Finds the closest matching ASME pipe standard for a given internal diameter (in meters).
 * Useful for initializing the dropdowns when loading a project.
 */
export const findClosestPipeMatch = (idMeters) => {
  const idMm = idMeters * 1000;
  let closest = null;
  let minDiff = 0.001; // Tolerance in mm for "exact" match

  for (const pipe of ASME_PIPE_STANDARDS) {
    for (const [sch, wt] of Object.entries(pipe.schedules)) {
      const id = pipe.od - 2 * wt;
      const diff = Math.abs(id - idMm);
      if (diff < minDiff) {
        return { dn: pipe.dn, sch };
      }
    }
  }
  return null;
};
