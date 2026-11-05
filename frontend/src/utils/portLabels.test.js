import { describe, it, expect } from 'vitest';
import { sensingPortsFor, sensingPinLabel, sensingPortLabel } from './portLabels';

describe('sensing port lists', () => {
  it.each([
    ['check_valve', ['inlet-0', 'outlet-0']],
    ['centrifugal_pump', ['inlet-0', 'outlet-0']],
    ['three_way_tcv', ['inlet-0', 'inlet-1', 'outlet-0']],
    [undefined, ['inlet-0', 'outlet-0']],
  ])('%s', (type, ports) => {
    expect(sensingPortsFor(type)).toEqual(ports);
  });
});

describe('sensing pin labels', () => {
  it.each([
    ['check_valve', 'inlet-0', 'Inlet'],
    ['check_valve', 'outlet-0', 'Outlet'],
    ['three_way_tcv', 'inlet-0', 'Inlet 1'],
    ['three_way_tcv', 'inlet-1', 'Inlet 2'],
    ['three_way_tcv', 'outlet-0', 'Outlet'],
    ['junction', 'port-0', 'Port 1'],
    ['orifice', 'port-2', 'Port 3'],
    ['check_valve', 'weird', 'weird'],
  ])('%s %s -> %s', (type, handle, label) => {
    expect(sensingPinLabel(type, handle)).toBe(label);
  });

  it.each([
    ['single role port stays unnumbered', 'inlet-0', ['inlet-0', 'outlet-0'], 'Inlet'],
    ['numbers only the role with several ports', 'outlet-0', ['inlet-0', 'inlet-1', 'outlet-0'], 'Outlet'],
    ['several outlets are numbered', 'outlet-1', ['outlet-0', 'outlet-1'], 'Outlet 2'],
    ['neutral port ignores the list', 'port-1', [], 'Port 2'],
    ['missing handle gives empty text', undefined, [], ''],
  ])('%s', (_name, handle, ports, label) => {
    expect(sensingPortLabel(handle, ports)).toBe(label);
  });
});
