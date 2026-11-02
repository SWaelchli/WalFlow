import { describe, it, expect } from 'vitest';
import { pressureDrop, pressureRise, outletFlow, neutralPorts, neutralDrop, nodePressure, isNodeOff, heatExchangerReadout } from './nodeReadouts';
import { formatDiffPressureFromPa, formatFlowFromM3s } from './converters';

const solved = { inlets: [{ pressure: 500000 }], outlets: [{ pressure: 300000, flow_rate: 0.001 }] };

describe('readouts before a run', () => {
  it('are null, and format as a dash, without telemetry', () => {
    expect(pressureDrop(undefined)).toBeNull();
    expect(pressureRise({})).toBeNull();
    expect(outletFlow(null)).toBeNull();
    expect(neutralPorts({ ports: [] })).toBeNull();
    expect(neutralDrop(undefined)).toBeNull();
    expect(formatDiffPressureFromPa(pressureDrop(undefined))).toBe('—');
    expect(formatFlowFromM3s(outletFlow(undefined))).toBe('—');
  });

  it('give a positive drop and a positive rise once solved (no negative drops)', () => {
    expect(pressureDrop(solved)).toBe(200000);
    expect(pressureRise({ inlets: [{ pressure: 100000 }], outlets: [{ pressure: 700000 }] })).toBe(600000);
    expect(outletFlow(solved)).toBe(0.001);
  });

  it('treat a real zero as a value, not as missing', () => {
    expect(pressureDrop({ inlets: [{ pressure: 100000 }], outlets: [{ pressure: 100000 }] })).toBe(0);
  });

  it('reads the pressure of the first piped port when port 0 is free', () => {
    expect(nodePressure({ ports: [null, { pressure: 250000 }, { pressure: 1 }] })).toBe(250000);
    expect(nodePressure({ ports: [null, null] })).toBeNull();
  });

  it('takes the port with positive inflow as upstream of a neutral two-port component', () => {
    const ports = (q0, q1) => ({ ports: [{ pressure: 300000, flow_rate: q0 }, { pressure: 500000, flow_rate: q1 }] });
    expect(neutralDrop(ports(-0.001, 0.001))).toBe(200000);
    expect(neutralDrop(ports(0.001, -0.001))).toBe(-200000);
    expect(neutralPorts(ports(0, 0)).upIdx).toBe(0);
  });
});

describe('isNodeOff', () => {
  it.each([
    ['switched off', { active: false }, true],
    ['active', { active: true }, false],
    ['flag never set', {}, false],
    ['no data', undefined, false],
  ])('%s', (_n, data, expected) => {
    expect(isNodeOff(data)).toBe(expected);
  });
});

describe('heatExchangerReadout', () => {
  const ports = (tIn, tOut, q = 0.001, density = 1000) => ({ inlets: [{ temperature: tIn, flow_rate: q, density }], outlets: [{ temperature: tOut }] });

  it.each([
    ['solver duty wins over the estimate', { ...ports(350, 330), actual_duty_kw: 12.5 }, 12.5, -20],
    ['solver duty of zero is a value', { ...ports(350, 330), actual_duty_kw: 0 }, 0, -20],
    ['water estimate m*cp*dT, positive when cooled', ports(350, 330), 0.001 * 1000 * 4184 * 20 / 1000, -20],
    ['oil estimate uses the lower cp', ports(350, 330, 0.001, 850), 0.001 * 850 * 2000 * 20 / 1000, -20],
    ['reverse flow still gives a duty by magnitude', ports(350, 330, -0.001), 0.001 * 1000 * 4184 * 20 / 1000, -20],
    ['heating gives a negative duty', ports(300, 320), -0.001 * 1000 * 4184 * 20 / 1000, 20],
    ['no flow, no estimate', ports(350, 330, 0), 0, -20],
    ['no result', undefined, 0, 0],
  ])('%s', (_n, telemetry, duty, dT) => {
    const r = heatExchangerReadout(telemetry);
    expect(r.dutyKw).toBeCloseTo(duty, 9);
    expect(r.deltaTK).toBeCloseTo(dT, 9);
  });
});
