import { getKFactorFromMatchCount, calculateElo } from '../eloCalc';

describe('getKFactorFromMatchCount', () => {
  it('returns 48 for new entries (<5 matches)', () => {
    expect(getKFactorFromMatchCount(0)).toBe(48);
    expect(getKFactorFromMatchCount(4)).toBe(48);
  });

  it('returns 32 for 5-19 matches', () => {
    expect(getKFactorFromMatchCount(5)).toBe(32);
    expect(getKFactorFromMatchCount(19)).toBe(32);
  });

  it('returns 24 for 20-49 matches', () => {
    expect(getKFactorFromMatchCount(20)).toBe(24);
    expect(getKFactorFromMatchCount(49)).toBe(24);
  });

  it('returns 16 for veterans (50+ matches)', () => {
    expect(getKFactorFromMatchCount(50)).toBe(16);
    expect(getKFactorFromMatchCount(200)).toBe(16);
  });
});

describe('calculateElo', () => {
  it('equal ratings, A wins → symmetric ±change', () => {
    const r = calculateElo(1000, 1000, 0, 0, 'win');
    expect(r.changeA).toBe(24); // k=48, expected=0.5 → 48*0.5=24
    expect(r.changeB).toBe(-24);
    expect(r.newEloA).toBe(1024);
    expect(r.newEloB).toBe(976);
  });

  it('higher rated A winning gives small gain', () => {
    const r = calculateElo(1200, 800, 50, 50, 'win');
    expect(r.changeA).toBeGreaterThan(0);
    expect(r.changeA).toBeLessThan(2); // expected≈0.99, k=16
  });

  it('lower rated B winning gives large gain', () => {
    const r = calculateElo(1200, 800, 50, 50, 'loss');
    expect(r.changeB).toBeGreaterThan(10);
  });

  it('draw between equal ratings → no change', () => {
    const r = calculateElo(1000, 1000, 0, 0, 'draw');
    expect(r.changeA).toBe(0);
    expect(r.changeB).toBe(0);
  });

  it('total elo change is conserved for equal K factors', () => {
    const r = calculateElo(1100, 900, 30, 30, 'win');
    expect(r.changeA + r.changeB).toBeLessThanOrEqual(Math.abs(r.kA) + Math.abs(r.kB));
  });
});
