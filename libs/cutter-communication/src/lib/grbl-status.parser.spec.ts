import { parseGrblStatus } from './grbl-status.parser';

describe('parseGrblStatus', () => {
  it('parses a status report with machine and work positions', () => {
    const status = parseGrblStatus(
      '<Run|MPos:12.500,-3.200,0.000|WPos:10.000,0.000,0.000|FS:500,0>',
    );

    expect(status.state).toBe('Run');
    expect(status.machinePosition).toEqual({ x: 12.5, y: -3.2, z: 0 });
    expect(status.workPosition).toEqual({ x: 10, y: 0, z: 0 });
  });

  it('parses a status report with no extra fields', () => {
    const status = parseGrblStatus('<Idle>');

    expect(status.state).toBe('Idle');
    expect(status.machinePosition).toBeUndefined();
    expect(status.workPosition).toBeUndefined();
  });

  it('strips the numeric sub-state from Door/Hold reports', () => {
    const status = parseGrblStatus('<Door:1|MPos:0.000,0.000,0.000|FS:0,0>');

    expect(status.state).toBe('Door');
  });

  it('throws on a malformed report', () => {
    expect(() => parseGrblStatus('Idle|MPos:0,0,0')).toThrow("Rapport d'état GRBL invalide");
  });
});
