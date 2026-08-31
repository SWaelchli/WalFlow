/**
 * ASME B16.9 and ASME B36.10M Standard Dimensional Data & Helpers
 * Provides client-side lookup tables for Concentric & Eccentric Reducers and Pipe Schedules.
 */

export const ASME_B36_10M_SCHEDULES = [
  {
    dn: 15, nps: "1/2", od_mm: 21.3,
    schedules: {
      "STD": { wt_mm: 2.77, id_mm: 15.76 },
      "40": { wt_mm: 2.77, id_mm: 15.76 },
      "80": { wt_mm: 3.73, id_mm: 13.84 },
      "XS": { wt_mm: 3.73, id_mm: 13.84 },
      "160": { wt_mm: 4.78, id_mm: 11.74 }
    }
  },
  {
    dn: 20, nps: "3/4", od_mm: 26.7,
    schedules: {
      "STD": { wt_mm: 2.87, id_mm: 20.96 },
      "40": { wt_mm: 2.87, id_mm: 20.96 },
      "80": { wt_mm: 3.91, id_mm: 18.88 },
      "XS": { wt_mm: 3.91, id_mm: 18.88 },
      "160": { wt_mm: 5.56, id_mm: 15.58 }
    }
  },
  {
    dn: 25, nps: "1", od_mm: 33.4,
    schedules: {
      "STD": { wt_mm: 3.38, id_mm: 26.64 },
      "40": { wt_mm: 3.38, id_mm: 26.64 },
      "80": { wt_mm: 4.55, id_mm: 24.30 },
      "XS": { wt_mm: 4.55, id_mm: 24.30 },
      "160": { wt_mm: 6.35, id_mm: 20.70 }
    }
  },
  {
    dn: 32, nps: "1 1/4", od_mm: 42.2,
    schedules: {
      "STD": { wt_mm: 3.56, id_mm: 35.08 },
      "40": { wt_mm: 3.56, id_mm: 35.08 },
      "80": { wt_mm: 4.85, id_mm: 32.50 },
      "XS": { wt_mm: 4.85, id_mm: 32.50 },
      "160": { wt_mm: 6.35, id_mm: 29.50 }
    }
  },
  {
    dn: 40, nps: "1 1/2", od_mm: 48.3,
    schedules: {
      "STD": { wt_mm: 3.68, id_mm: 40.94 },
      "40": { wt_mm: 3.68, id_mm: 40.94 },
      "80": { wt_mm: 5.08, id_mm: 38.14 },
      "XS": { wt_mm: 5.08, id_mm: 38.14 },
      "160": { wt_mm: 7.14, id_mm: 34.02 }
    }
  },
  {
    dn: 50, nps: "2", od_mm: 60.3,
    schedules: {
      "STD": { wt_mm: 3.91, id_mm: 52.48 },
      "40": { wt_mm: 3.91, id_mm: 52.48 },
      "80": { wt_mm: 5.54, id_mm: 49.22 },
      "XS": { wt_mm: 5.54, id_mm: 49.22 },
      "160": { wt_mm: 8.74, id_mm: 42.82 }
    }
  },
  {
    dn: 65, nps: "2 1/2", od_mm: 73.0,
    schedules: {
      "STD": { wt_mm: 5.16, id_mm: 62.68 },
      "40": { wt_mm: 5.16, id_mm: 62.68 },
      "80": { wt_mm: 7.01, id_mm: 58.98 },
      "XS": { wt_mm: 7.01, id_mm: 58.98 },
      "160": { wt_mm: 9.53, id_mm: 53.94 }
    }
  },
  {
    dn: 80, nps: "3", od_mm: 88.9,
    schedules: {
      "STD": { wt_mm: 5.49, id_mm: 77.92 },
      "40": { wt_mm: 5.49, id_mm: 77.92 },
      "80": { wt_mm: 7.62, id_mm: 73.66 },
      "XS": { wt_mm: 7.62, id_mm: 73.66 },
      "160": { wt_mm: 11.13, id_mm: 66.64 }
    }
  },
  {
    dn: 90, nps: "3 1/2", od_mm: 101.6,
    schedules: {
      "STD": { wt_mm: 5.74, id_mm: 90.12 },
      "40": { wt_mm: 5.74, id_mm: 90.12 },
      "80": { wt_mm: 8.08, id_mm: 85.44 },
      "XS": { wt_mm: 8.08, id_mm: 85.44 }
    }
  },
  {
    dn: 100, nps: "4", od_mm: 114.3,
    schedules: {
      "STD": { wt_mm: 6.02, id_mm: 102.26 },
      "40": { wt_mm: 6.02, id_mm: 102.26 },
      "80": { wt_mm: 8.56, id_mm: 97.18 },
      "XS": { wt_mm: 8.56, id_mm: 97.18 },
      "160": { wt_mm: 13.49, id_mm: 87.32 }
    }
  },
  {
    dn: 125, nps: "5", od_mm: 141.3,
    schedules: {
      "STD": { wt_mm: 6.55, id_mm: 128.20 },
      "40": { wt_mm: 6.55, id_mm: 128.20 },
      "80": { wt_mm: 9.53, id_mm: 122.24 },
      "XS": { wt_mm: 9.53, id_mm: 122.24 },
      "160": { wt_mm: 15.88, id_mm: 109.54 }
    }
  },
  {
    dn: 150, nps: "6", od_mm: 168.3,
    schedules: {
      "STD": { wt_mm: 7.11, id_mm: 154.08 },
      "40": { wt_mm: 7.11, id_mm: 154.08 },
      "80": { wt_mm: 10.97, id_mm: 146.36 },
      "XS": { wt_mm: 10.97, id_mm: 146.36 },
      "160": { wt_mm: 18.26, id_mm: 131.78 }
    }
  },
  {
    dn: 200, nps: "8", od_mm: 219.1,
    schedules: {
      "STD": { wt_mm: 8.18, id_mm: 202.74 },
      "40": { wt_mm: 8.18, id_mm: 202.74 },
      "80": { wt_mm: 12.70, id_mm: 193.70 },
      "XS": { wt_mm: 12.70, id_mm: 193.70 },
      "160": { wt_mm: 23.01, id_mm: 173.08 }
    }
  },
  {
    dn: 250, nps: "10", od_mm: 273.0,
    schedules: {
      "STD": { wt_mm: 9.27, id_mm: 254.46 },
      "40": { wt_mm: 9.27, id_mm: 254.46 },
      "80": { wt_mm: 15.09, id_mm: 242.82 },
      "XS": { wt_mm: 12.70, id_mm: 247.60 },
      "160": { wt_mm: 28.58, id_mm: 215.84 }
    }
  },
  {
    dn: 300, nps: "12", od_mm: 323.8,
    schedules: {
      "STD": { wt_mm: 9.53, id_mm: 304.74 },
      "40": { wt_mm: 10.31, id_mm: 303.18 },
      "80": { wt_mm: 17.48, id_mm: 288.84 },
      "XS": { wt_mm: 12.70, id_mm: 298.40 },
      "160": { wt_mm: 33.32, id_mm: 257.16 }
    }
  },
  {
    dn: 350, nps: "14", od_mm: 355.6,
    schedules: {
      "STD": { wt_mm: 9.53, id_mm: 336.54 },
      "40": { wt_mm: 11.13, id_mm: 333.34 },
      "80": { wt_mm: 19.05, id_mm: 317.50 },
      "XS": { wt_mm: 12.70, id_mm: 330.20 }
    }
  },
  {
    dn: 400, nps: "16", od_mm: 406.4,
    schedules: {
      "STD": { wt_mm: 9.53, id_mm: 387.34 },
      "40": { wt_mm: 12.70, id_mm: 381.00 },
      "80": { wt_mm: 21.44, id_mm: 363.52 },
      "XS": { wt_mm: 12.70, id_mm: 381.00 }
    }
  },
  {
    dn: 450, "nps": "18", od_mm: 457.0,
    schedules: {
      "STD": { wt_mm: 9.53, id_mm: 437.94 },
      "40": { wt_mm: 14.27, id_mm: 428.46 },
      "80": { wt_mm: 23.83, id_mm: 409.34 },
      "XS": { wt_mm: 12.70, id_mm: 431.60 }
    }
  },
  {
    dn: 500, nps: "20", od_mm: 508.0,
    schedules: {
      "STD": { wt_mm: 9.53, id_mm: 488.94 },
      "40": { wt_mm: 15.09, id_mm: 477.82 },
      "80": { wt_mm: 26.19, id_mm: 455.62 },
      "XS": { wt_mm: 12.70, id_mm: 482.60 }
    }
  },
  {
    dn: 600, nps: "24", od_mm: 610.0,
    schedules: {
      "STD": { wt_mm: 9.53, id_mm: 590.94 },
      "40": { wt_mm: 17.48, id_mm: 575.04 },
      "80": { wt_mm: 30.96, id_mm: 548.08 },
      "XS": { wt_mm: 12.70, id_mm: 584.60 }
    }
  }
];

const OD_MAP = {};
ASME_B36_10M_SCHEDULES.forEach(s => {
  OD_MAP[s.dn] = s.od_mm;
});

export function getPipeOuterDiameter(dn) {
  return OD_MAP[dn] || 0.0;
}

export function getPipeScheduleDetails(dn, sch = 'STD') {
  const sizeObj = ASME_B36_10M_SCHEDULES.find(s => s.dn === Number(dn));
  if (!sizeObj) return null;
  const schObj = sizeObj.schedules[sch] || sizeObj.schedules['STD'] || sizeObj.schedules['40'];
  if (!schObj) return null;
  return {
    dn: sizeObj.dn,
    nps: sizeObj.nps,
    od_mm: sizeObj.od_mm,
    wt_mm: schObj.wt_mm,
    id_mm: schObj.id_mm,
    sch: sch
  };
}

export const ASME_B16_9_REDUCERS = [
  { dn_large: 20, nps_large: "3/4", od_large_mm: 26.7, dn_small: 15, nps_small: "1/2", od_small_mm: 21.3, length_mm: 38.0, cone_angle_deg: 8.13 },
  { dn_large: 25, nps_large: "1", od_large_mm: 33.4, dn_small: 20, nps_small: "3/4", od_small_mm: 26.7, length_mm: 51.0, cone_angle_deg: 7.51 },
  { dn_large: 25, nps_large: "1", od_large_mm: 33.4, dn_small: 15, nps_small: "1/2", od_small_mm: 21.3, length_mm: 51.0, cone_angle_deg: 13.52 },
  { dn_large: 32, nps_large: "1 1/4", od_large_mm: 42.2, dn_small: 25, nps_small: "1", od_small_mm: 33.4, length_mm: 51.0, cone_angle_deg: 9.85 },
  { dn_large: 32, nps_large: "1 1/4", od_large_mm: 42.2, dn_small: 20, nps_small: "3/4", od_small_mm: 26.7, length_mm: 51.0, cone_angle_deg: 17.25 },
  { dn_large: 32, nps_large: "1 1/4", od_large_mm: 42.2, dn_small: 15, nps_small: "1/2", od_small_mm: 21.3, length_mm: 51.0, cone_angle_deg: 23.11 },
  { dn_large: 40, nps_large: "1 1/2", od_large_mm: 48.3, dn_small: 32, nps_small: "1 1/4", od_small_mm: 42.2, length_mm: 64.0, cone_angle_deg: 5.45 },
  { dn_large: 40, nps_large: "1 1/2", od_large_mm: 48.3, dn_small: 25, nps_small: "1", od_small_mm: 33.4, length_mm: 64.0, cone_angle_deg: 13.27 },
  { dn_large: 40, nps_large: "1 1/2", od_large_mm: 48.3, dn_small: 20, nps_small: "3/4", od_small_mm: 26.7, length_mm: 64.0, cone_angle_deg: 19.16 },
  { dn_large: 40, nps_large: "1 1/2", od_large_mm: 48.3, dn_small: 15, nps_small: "1/2", od_small_mm: 21.3, length_mm: 64.0, cone_angle_deg: 23.82 },
  { dn_large: 50, nps_large: "2", od_large_mm: 60.3, dn_small: 40, nps_small: "1 1/2", od_small_mm: 48.3, length_mm: 76.0, cone_angle_deg: 9.02 },
  { dn_large: 50, nps_large: "2", od_large_mm: 60.3, dn_small: 32, nps_small: "1 1/4", od_small_mm: 42.2, length_mm: 76.0, cone_angle_deg: 13.56 },
  { dn_large: 50, nps_large: "2", od_large_mm: 60.3, dn_small: 25, nps_small: "1", od_small_mm: 33.4, length_mm: 76.0, cone_angle_deg: 20.08 },
  { dn_large: 50, nps_large: "2", od_large_mm: 60.3, dn_small: 20, nps_small: "3/4", od_small_mm: 26.7, length_mm: 76.0, cone_angle_deg: 24.96 },
  { dn_large: 65, nps_large: "2 1/2", od_large_mm: 73.0, dn_small: 50, nps_small: "2", od_small_mm: 60.3, length_mm: 89.0, cone_angle_deg: 8.15 },
  { dn_large: 65, nps_large: "2 1/2", od_large_mm: 73.0, dn_small: 40, nps_small: "1 1/2", od_small_mm: 48.3, length_mm: 89.0, cone_angle_deg: 15.77 },
  { dn_large: 65, nps_large: "2 1/2", od_large_mm: 73.0, dn_small: 32, nps_small: "1 1/4", od_small_mm: 42.2, length_mm: 89.0, cone_angle_deg: 19.60 },
  { dn_large: 65, nps_large: "2 1/2", od_large_mm: 73.0, dn_small: 25, nps_small: "1", od_small_mm: 33.4, length_mm: 89.0, cone_angle_deg: 25.06 },
  { dn_large: 80, nps_large: "3", od_large_mm: 88.9, dn_small: 65, nps_small: "2 1/2", od_small_mm: 73.0, length_mm: 89.0, cone_angle_deg: 10.19 },
  { dn_large: 80, nps_large: "3", od_large_mm: 88.9, dn_small: 50, nps_small: "2", od_small_mm: 60.3, length_mm: 89.0, cone_angle_deg: 18.20 },
  { dn_large: 80, nps_large: "3", od_large_mm: 88.9, dn_small: 40, nps_small: "1 1/2", od_small_mm: 48.3, length_mm: 89.0, cone_angle_deg: 25.64 },
  { dn_large: 80, nps_large: "3", od_large_mm: 88.9, dn_small: 32, nps_small: "1 1/4", od_small_mm: 42.2, length_mm: 89.0, cone_angle_deg: 29.31 },
  { dn_large: 90, nps_large: "3 1/2", od_large_mm: 101.6, dn_small: 80, nps_small: "3", od_small_mm: 88.9, length_mm: 102.0, cone_angle_deg: 7.12 },
  { dn_large: 90, nps_large: "3 1/2", od_large_mm: 101.6, dn_small: 65, nps_small: "2 1/2", od_small_mm: 73.0, length_mm: 102.0, cone_angle_deg: 15.96 },
  { dn_large: 90, nps_large: "3 1/2", od_large_mm: 101.6, dn_small: 50, nps_small: "2", od_small_mm: 60.3, length_mm: 102.0, cone_angle_deg: 22.89 },
  { dn_large: 90, nps_large: "3 1/2", od_large_mm: 101.6, dn_small: 40, nps_small: "1 1/2", od_small_mm: 48.3, length_mm: 102.0, cone_angle_deg: 29.27 },
  { dn_large: 100, nps_large: "4", od_large_mm: 114.3, dn_small: 90, nps_small: "3 1/2", od_small_mm: 101.6, length_mm: 102.0, cone_angle_deg: 7.12 },
  { dn_large: 100, nps_large: "4", od_large_mm: 114.3, dn_small: 80, nps_small: "3", od_small_mm: 88.9, length_mm: 102.0, cone_angle_deg: 14.19 },
  { dn_large: 100, nps_large: "4", od_large_mm: 114.3, dn_small: 65, nps_small: "2 1/2", od_small_mm: 73.0, length_mm: 102.0, cone_angle_deg: 22.89 },
  { dn_large: 100, nps_large: "4", od_large_mm: 114.3, dn_small: 50, nps_small: "2", od_small_mm: 60.3, length_mm: 102.0, cone_angle_deg: 29.62 },
  { dn_large: 100, nps_large: "4", od_large_mm: 114.3, dn_small: 40, nps_small: "1 1/2", od_small_mm: 48.3, length_mm: 102.0, cone_angle_deg: 35.73 },
  { dn_large: 125, nps_large: "5", od_large_mm: 141.3, dn_small: 100, nps_small: "4", od_small_mm: 114.3, length_mm: 127.0, cone_angle_deg: 12.14 },
  { dn_large: 125, nps_large: "5", od_large_mm: 141.3, dn_small: 80, nps_small: "3", od_small_mm: 88.9, length_mm: 127.0, cone_angle_deg: 23.32 },
  { dn_large: 125, nps_large: "5", od_large_mm: 141.3, dn_small: 65, nps_small: "2 1/2", od_small_mm: 73.0, length_mm: 127.0, cone_angle_deg: 30.13 },
  { dn_large: 125, nps_large: "5", od_large_mm: 141.3, dn_small: 50, nps_small: "2", od_small_mm: 60.3, length_mm: 127.0, cone_angle_deg: 35.37 },
  { dn_large: 150, nps_large: "6", od_large_mm: 168.3, dn_small: 125, nps_small: "5", od_small_mm: 141.3, length_mm: 140.0, cone_angle_deg: 11.00 },
  { dn_large: 150, nps_large: "6", od_large_mm: 168.3, dn_small: 100, nps_small: "4", od_small_mm: 114.3, length_mm: 140.0, cone_angle_deg: 21.84 },
  { dn_large: 150, nps_large: "6", od_large_mm: 168.3, dn_small: 80, nps_small: "3", od_small_mm: 88.9, length_mm: 140.0, cone_angle_deg: 31.64 },
  { dn_large: 150, nps_large: "6", od_large_mm: 168.3, dn_small: 65, nps_small: "2 1/2", od_small_mm: 73.0, length_mm: 140.0, cone_angle_deg: 37.60 },
  { dn_large: 200, nps_large: "8", od_large_mm: 219.1, dn_small: 150, nps_small: "6", od_small_mm: 168.3, length_mm: 152.0, cone_angle_deg: 18.98 },
  { dn_large: 200, nps_large: "8", od_large_mm: 219.1, dn_small: 125, nps_small: "5", od_small_mm: 141.3, length_mm: 152.0, cone_angle_deg: 28.79 },
  { dn_large: 200, nps_large: "8", od_large_mm: 219.1, dn_small: 100, nps_small: "4", od_small_mm: 114.3, length_mm: 152.0, cone_angle_deg: 38.08 },
  { dn_large: 200, nps_large: "8", od_large_mm: 219.1, dn_small: 90, nps_small: "3 1/2", od_small_mm: 101.6, length_mm: 152.0, cone_angle_deg: 42.27 },
  { dn_large: 250, nps_large: "10", od_large_mm: 273.0, dn_small: 200, nps_small: "8", od_small_mm: 219.1, length_mm: 178.0, cone_angle_deg: 17.20 },
  { dn_large: 250, nps_large: "10", od_large_mm: 273.0, dn_small: 150, nps_small: "6", od_small_mm: 168.3, length_mm: 178.0, cone_angle_deg: 32.80 },
  { dn_large: 250, nps_large: "10", od_large_mm: 273.0, dn_small: 125, nps_small: "5", od_small_mm: 141.3, length_mm: 178.0, cone_angle_deg: 40.59 },
  { dn_large: 250, nps_large: "10", od_large_mm: 273.0, dn_small: 100, nps_small: "4", od_small_mm: 114.3, length_mm: 178.0, cone_angle_deg: 48.01 },
  { dn_large: 300, nps_large: "12", od_large_mm: 323.8, dn_small: 250, nps_small: "10", od_small_mm: 273.0, length_mm: 203.0, cone_angle_deg: 14.26 },
  { dn_large: 300, nps_large: "12", od_large_mm: 323.8, dn_small: 200, nps_small: "8", od_small_mm: 219.1, length_mm: 203.0, cone_angle_deg: 28.92 },
  { dn_large: 300, nps_large: "12", od_large_mm: 323.8, dn_small: 150, nps_small: "6", od_small_mm: 168.3, length_mm: 203.0, cone_angle_deg: 41.91 },
  { dn_large: 300, nps_large: "12", od_large_mm: 323.8, dn_small: 125, nps_small: "5", od_small_mm: 141.3, length_mm: 203.0, cone_angle_deg: 48.41 },
  { dn_large: 350, nps_large: "14", od_large_mm: 355.6, dn_small: 300, nps_small: "12", od_small_mm: 323.8, length_mm: 330.0, cone_angle_deg: 5.52 },
  { dn_large: 350, nps_large: "14", od_large_mm: 355.6, dn_small: 250, nps_small: "10", od_small_mm: 273.0, length_mm: 330.0, cone_angle_deg: 14.27 },
  { dn_large: 350, nps_large: "14", od_large_mm: 355.6, dn_small: 200, nps_small: "8", od_small_mm: 219.1, length_mm: 330.0, cone_angle_deg: 23.37 },
  { dn_large: 350, nps_large: "14", od_large_mm: 355.6, dn_small: 150, nps_small: "6", od_small_mm: 168.3, length_mm: 330.0, cone_angle_deg: 31.69 },
  { dn_large: 400, nps_large: "16", od_large_mm: 406.4, dn_small: 350, nps_small: "14", od_small_mm: 355.6, length_mm: 356.0, cone_angle_deg: 8.16 },
  { dn_large: 400, nps_large: "16", od_large_mm: 406.4, dn_small: 300, nps_small: "12", od_small_mm: 323.8, length_mm: 356.0, cone_angle_deg: 13.23 },
  { dn_large: 400, nps_large: "16", od_large_mm: 406.4, dn_small: 250, nps_small: "10", od_small_mm: 273.0, length_mm: 356.0, cone_angle_deg: 21.22 },
  { dn_large: 400, nps_large: "16", od_large_mm: 406.4, dn_small: 200, nps_small: "8", od_small_mm: 219.1, length_mm: 356.0, cone_angle_deg: 29.48 },
  { dn_large: 450, nps_large: "18", od_large_mm: 457.0, dn_small: 400, nps_small: "16", od_small_mm: 406.4, length_mm: 381.0, cone_angle_deg: 7.60 },
  { dn_large: 450, nps_large: "18", od_large_mm: 457.0, dn_small: 350, nps_small: "14", od_small_mm: 355.6, length_mm: 381.0, cone_angle_deg: 15.16 },
  { dn_large: 450, nps_large: "18", od_large_mm: 457.0, dn_small: 300, nps_small: "12", od_small_mm: 323.8, length_mm: 381.0, cone_angle_deg: 19.83 },
  { dn_large: 450, nps_large: "18", od_large_mm: 457.0, dn_small: 250, nps_small: "10", od_small_mm: 273.0, length_mm: 381.0, cone_angle_deg: 27.15 },
  { dn_large: 500, nps_large: "20", od_large_mm: 508.0, dn_small: 450, nps_small: "18", od_small_mm: 457.0, length_mm: 508.0, cone_angle_deg: 5.75 },
  { dn_large: 500, nps_large: "20", od_large_mm: 508.0, dn_small: 400, nps_small: "16", od_small_mm: 406.4, length_mm: 508.0, cone_angle_deg: 11.42 },
  { dn_large: 500, nps_large: "20", od_large_mm: 508.0, dn_small: 350, nps_small: "14", od_small_mm: 355.6, length_mm: 508.0, cone_angle_deg: 17.06 },
  { dn_large: 500, nps_large: "20", od_large_mm: 508.0, dn_small: 300, nps_small: "12", od_small_mm: 323.8, length_mm: 508.0, cone_angle_deg: 20.55 },
  { dn_large: 600, nps_large: "24", od_large_mm: 610.0, dn_small: 500, nps_small: "20", od_small_mm: 508.0, length_mm: 508.0, cone_angle_deg: 11.47 },
  { dn_large: 600, nps_large: "24", od_large_mm: 610.0, dn_small: 450, nps_small: "18", od_small_mm: 457.0, length_mm: 508.0, cone_angle_deg: 17.13 },
  { dn_large: 600, nps_large: "24", od_large_mm: 610.0, dn_small: 400, nps_small: "16", od_small_mm: 406.4, length_mm: 508.0, cone_angle_deg: 22.66 },
  { dn_large: 600, nps_large: "24", od_large_mm: 610.0, dn_small: 350, nps_small: "14", od_small_mm: 355.6, length_mm: 508.0, cone_angle_deg: 28.11 }
];

export function getReducerCombinations(dnLarge, standard = 'ASME_B16_9') {
  const dataset = standard === 'DIN_EN_10253_2' ? DIN_EN_10253_2_REDUCERS : ASME_B16_9_REDUCERS;
  if (!dnLarge) return dataset;
  return dataset.filter(r => r.dn_large === Number(dnLarge));
}

export function getReducerEntry(dnLarge, dnSmall, standard = 'ASME_B16_9') {
  const dataset = standard === 'DIN_EN_10253_2' ? DIN_EN_10253_2_REDUCERS : ASME_B16_9_REDUCERS;
  return dataset.find(
    r => r.dn_large === Number(dnLarge) && r.dn_small === Number(dnSmall)
  ) || null;
}

export const DIN_EN_10253_2_REDUCERS = [
  { dn_large: 25, nps_large: "DN25", od_large_mm: 33.7, dn_small: 20, nps_small: "DN20", od_small_mm: 26.9, length_mm: 50.0, cone_angle_deg: 7.78 },
  { dn_large: 32, nps_large: "DN32", od_large_mm: 42.4, dn_small: 25, nps_small: "DN25", od_small_mm: 33.7, length_mm: 50.0, cone_angle_deg: 9.92 },
  { dn_large: 32, nps_large: "DN32", od_large_mm: 42.4, dn_small: 20, nps_small: "DN20", od_small_mm: 26.9, length_mm: 50.0, cone_angle_deg: 17.59 },
  { dn_large: 40, nps_large: "DN40", od_large_mm: 48.3, dn_small: 32, nps_small: "DN32", od_small_mm: 42.4, length_mm: 64.0, cone_angle_deg: 5.27 },
  { dn_large: 40, nps_large: "DN40", od_large_mm: 48.3, dn_small: 25, nps_small: "DN25", od_small_mm: 33.7, length_mm: 64.0, cone_angle_deg: 12.98 },
  { dn_large: 50, nps_large: "DN50", od_large_mm: 60.3, dn_small: 40, nps_small: "DN40", od_small_mm: 48.3, length_mm: 76.0, cone_angle_deg: 9.03 },
  { dn_large: 50, nps_large: "DN50", od_large_mm: 60.3, dn_small: 32, nps_small: "DN32", od_small_mm: 42.4, length_mm: 76.0, cone_angle_deg: 13.44 },
  { dn_large: 65, nps_large: "DN65", od_large_mm: 76.1, dn_small: 50, nps_small: "DN50", od_small_mm: 60.3, length_mm: 89.0, cone_angle_deg: 10.12 },
  { dn_large: 80, nps_large: "DN80", od_large_mm: 88.9, dn_small: 65, nps_small: "DN65", od_small_mm: 76.1, length_mm: 89.0, cone_angle_deg: 8.21 },
  { dn_large: 80, nps_large: "DN80", od_large_mm: 88.9, dn_small: 50, nps_small: "DN50", od_small_mm: 60.3, length_mm: 89.0, cone_angle_deg: 18.20 },
  { dn_large: 100, nps_large: "DN100", od_large_mm: 114.3, dn_small: 80, nps_small: "DN80", od_small_mm: 88.9, length_mm: 102.0, cone_angle_deg: 14.19 },
  { dn_large: 100, nps_large: "DN100", od_large_mm: 114.3, dn_small: 65, nps_small: "DN65", od_small_mm: 76.1, length_mm: 102.0, cone_angle_deg: 21.23 },
  { dn_large: 125, nps_large: "DN125", od_large_mm: 139.7, dn_small: 100, nps_small: "DN100", od_small_mm: 114.3, length_mm: 127.0, cone_angle_deg: 11.42 },
  { dn_large: 150, nps_large: "DN150", od_large_mm: 168.3, dn_small: 125, nps_small: "DN125", od_small_mm: 139.7, length_mm: 140.0, cone_angle_deg: 11.66 },
  { dn_large: 150, nps_large: "DN150", od_large_mm: 168.3, dn_small: 100, nps_small: "DN100", od_small_mm: 114.3, length_mm: 140.0, cone_angle_deg: 21.80 },
  { dn_large: 200, nps_large: "DN200", od_large_mm: 219.1, dn_small: 150, nps_small: "DN150", od_small_mm: 168.3, length_mm: 152.0, cone_angle_deg: 18.94 },
  { dn_large: 250, nps_large: "DN250", od_large_mm: 273.0, dn_small: 200, nps_small: "DN200", od_small_mm: 219.1, length_mm: 178.0, cone_angle_deg: 17.20 },
  { dn_large: 300, nps_large: "DN300", od_large_mm: 323.9, dn_small: 250, nps_small: "DN250", od_small_mm: 273.0, length_mm: 203.0, cone_angle_deg: 14.28 },
  { dn_large: 350, nps_large: "DN350", od_large_mm: 355.6, dn_small: 300, nps_small: "DN300", od_small_mm: 323.9, length_mm: 330.0, cone_angle_deg: 5.50 },
  { dn_large: 400, nps_large: "DN400", od_large_mm: 406.4, dn_small: 350, nps_small: "DN350", od_small_mm: 355.6, length_mm: 356.0, cone_angle_deg: 8.16 },
  { dn_large: 500, nps_large: "DN500", od_large_mm: 508.0, dn_small: 400, nps_small: "DN400", od_small_mm: 406.4, length_mm: 508.0, cone_angle_deg: 11.42 },
  { dn_large: 600, nps_large: "DN600", od_large_mm: 610.0, dn_small: 500, nps_small: "DN500", od_small_mm: 508.0, length_mm: 508.0, cone_angle_deg: 11.47 }
];

