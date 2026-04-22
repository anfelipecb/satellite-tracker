import { describe, expect, it } from 'vitest';
import { parseGpTleText, tleEpochToDate } from './tleParse.js';

describe('parseGpTleText', () => {
  it('parses a single ISS block', () => {
    const raw = `ISS (ZARYA)
1 25544U 98067A   24112.12345678  .00016717  00000+0  10270-3 0  9990
2 25544  51.6416 339.1234 0003456 123.4567  45.6789 15.54234567890123
`;
    const blocks = parseGpTleText(raw);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.noradId).toBe(25544);
    expect(blocks[0]!.name).toContain('ISS');
  });
});

describe('tleEpochToDate', () => {
  it('returns a valid Date', () => {
    const line1 =
      '1 25544U 98067A   24112.50000000  .00016717  00000+0  10270-3 0  9990';
    const d = tleEpochToDate(line1);
    expect(d.getUTCFullYear()).toBeGreaterThan(2020);
  });
});
