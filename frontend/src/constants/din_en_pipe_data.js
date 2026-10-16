/**
 * DIN EN pipe dimensions (bundled copy of the backend seed `DIN_EN_PIPE_SCHEDULES`).
 * EN 10220 / ISO 4200 series 1 outside diameters, shared with the DIN EN 10253-2 reducers.
 * EN has no schedules; the wall series are used as designations:
 *   Normal   - DIN 2448 / EN 10220 normal wall (counterpart of ASME STD)
 *   Heavy    - reinforced wall (counterpart of ASME XS)
 *   ISO 1127 - thin-wall stainless tube per EN ISO 1127 (counterpart of ASME 10S)
 * Values are in mm.
 */
export const DIN_EN_PIPE_SCHEDULES = [
  { dn: 15, nps: 'DN15', od_mm: 21.3, schedules: { Normal: { wt_mm: 2.0, id_mm: 17.3 }, Heavy: { wt_mm: 3.2, id_mm: 14.9 }, 'ISO 1127': { wt_mm: 1.6, id_mm: 18.1 } } },
  { dn: 20, nps: 'DN20', od_mm: 26.9, schedules: { Normal: { wt_mm: 2.3, id_mm: 22.3 }, Heavy: { wt_mm: 3.2, id_mm: 20.5 }, 'ISO 1127': { wt_mm: 1.6, id_mm: 23.7 } } },
  { dn: 25, nps: 'DN25', od_mm: 33.7, schedules: { Normal: { wt_mm: 2.6, id_mm: 28.5 }, Heavy: { wt_mm: 4.0, id_mm: 25.7 }, 'ISO 1127': { wt_mm: 2.0, id_mm: 29.7 } } },
  { dn: 32, nps: 'DN32', od_mm: 42.4, schedules: { Normal: { wt_mm: 2.6, id_mm: 37.2 }, Heavy: { wt_mm: 4.0, id_mm: 34.4 }, 'ISO 1127': { wt_mm: 2.0, id_mm: 38.4 } } },
  { dn: 40, nps: 'DN40', od_mm: 48.3, schedules: { Normal: { wt_mm: 2.6, id_mm: 43.1 }, Heavy: { wt_mm: 4.0, id_mm: 40.3 }, 'ISO 1127': { wt_mm: 2.0, id_mm: 44.3 } } },
  { dn: 50, nps: 'DN50', od_mm: 60.3, schedules: { Normal: { wt_mm: 2.9, id_mm: 54.5 }, Heavy: { wt_mm: 4.5, id_mm: 51.3 }, 'ISO 1127': { wt_mm: 2.0, id_mm: 56.3 } } },
  { dn: 65, nps: 'DN65', od_mm: 76.1, schedules: { Normal: { wt_mm: 2.9, id_mm: 70.3 }, Heavy: { wt_mm: 5.0, id_mm: 66.1 }, 'ISO 1127': { wt_mm: 2.0, id_mm: 72.1 } } },
  { dn: 80, nps: 'DN80', od_mm: 88.9, schedules: { Normal: { wt_mm: 3.2, id_mm: 82.5 }, Heavy: { wt_mm: 5.6, id_mm: 77.7 }, 'ISO 1127': { wt_mm: 2.3, id_mm: 84.3 } } },
  { dn: 100, nps: 'DN100', od_mm: 114.3, schedules: { Normal: { wt_mm: 3.6, id_mm: 107.1 }, Heavy: { wt_mm: 6.3, id_mm: 101.7 }, 'ISO 1127': { wt_mm: 2.3, id_mm: 109.7 } } },
  { dn: 125, nps: 'DN125', od_mm: 139.7, schedules: { Normal: { wt_mm: 4.0, id_mm: 131.7 }, Heavy: { wt_mm: 6.3, id_mm: 127.1 }, 'ISO 1127': { wt_mm: 2.6, id_mm: 134.5 } } },
  { dn: 150, nps: 'DN150', od_mm: 168.3, schedules: { Normal: { wt_mm: 4.5, id_mm: 159.3 }, Heavy: { wt_mm: 7.1, id_mm: 154.1 }, 'ISO 1127': { wt_mm: 2.6, id_mm: 163.1 } } },
  { dn: 200, nps: 'DN200', od_mm: 219.1, schedules: { Normal: { wt_mm: 6.3, id_mm: 206.5 }, Heavy: { wt_mm: 8.0, id_mm: 203.1 }, 'ISO 1127': { wt_mm: 2.6, id_mm: 213.9 } } },
  { dn: 250, nps: 'DN250', od_mm: 273.0, schedules: { Normal: { wt_mm: 6.3, id_mm: 260.4 }, Heavy: { wt_mm: 10.0, id_mm: 253.0 }, 'ISO 1127': { wt_mm: 2.9, id_mm: 267.2 } } },
  { dn: 300, nps: 'DN300', od_mm: 323.9, schedules: { Normal: { wt_mm: 7.1, id_mm: 309.7 }, Heavy: { wt_mm: 10.0, id_mm: 303.9 }, 'ISO 1127': { wt_mm: 2.9, id_mm: 318.1 } } },
  { dn: 350, nps: 'DN350', od_mm: 355.6, schedules: { Normal: { wt_mm: 8.0, id_mm: 339.6 }, Heavy: { wt_mm: 11.0, id_mm: 333.6 }, 'ISO 1127': { wt_mm: 3.2, id_mm: 349.2 } } },
  { dn: 400, nps: 'DN400', od_mm: 406.4, schedules: { Normal: { wt_mm: 8.8, id_mm: 388.8 }, Heavy: { wt_mm: 12.5, id_mm: 381.4 }, 'ISO 1127': { wt_mm: 3.2, id_mm: 400.0 } } },
  { dn: 450, nps: 'DN450', od_mm: 457.0, schedules: { Normal: { wt_mm: 10.0, id_mm: 437.0 }, Heavy: { wt_mm: 12.5, id_mm: 432.0 }, 'ISO 1127': { wt_mm: 4.0, id_mm: 449.0 } } },
  { dn: 500, nps: 'DN500', od_mm: 508.0, schedules: { Normal: { wt_mm: 11.0, id_mm: 486.0 }, Heavy: { wt_mm: 14.2, id_mm: 479.6 }, 'ISO 1127': { wt_mm: 4.0, id_mm: 500.0 } } },
  { dn: 600, nps: 'DN600', od_mm: 610.0, schedules: { Normal: { wt_mm: 12.5, id_mm: 585.0 }, Heavy: { wt_mm: 16.0, id_mm: 578.0 }, 'ISO 1127': { wt_mm: 4.0, id_mm: 602.0 } } }
];
