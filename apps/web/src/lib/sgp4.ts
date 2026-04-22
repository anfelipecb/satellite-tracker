import * as satellite from 'satellite.js';

function rad2deg(r: number) {
  return (r * 180) / Math.PI;
}

export type TleRow = { norad_id: number; line1: string; line2: string };

export function propagatePositionDeg(
  row: TleRow,
  when: Date
): { lat: number; lon: number; altKm: number } | null {
  try {
    const satrec = satellite.twoline2satrec(row.line1, row.line2);
    const pv = satellite.propagate(satrec, when);
    const positionEci = pv.position;
    if (!positionEci || typeof positionEci === 'boolean') return null;
    const gmst = satellite.gstime(when);
    const gd = satellite.eciToGeodetic(positionEci, gmst);
    return {
      lat: rad2deg(gd.latitude),
      lon: rad2deg(gd.longitude),
      altKm: gd.height,
    };
  } catch {
    return null;
  }
}

export function elevationDegForObserver(
  row: TleRow,
  when: Date,
  observerLat: number,
  observerLon: number
): number | null {
  try {
    const satrec = satellite.twoline2satrec(row.line1, row.line2);
    const pv = satellite.propagate(satrec, when);
    const positionEci = pv.position;
    if (!positionEci || typeof positionEci === 'boolean') return null;
    const gmst = satellite.gstime(when);
    const positionEcf = satellite.eciToEcf(positionEci, gmst);
    const observerGd = {
      longitude: satellite.degreesToRadians(observerLon),
      latitude: satellite.degreesToRadians(observerLat),
      height: 0.001,
    };
    const look = satellite.ecfToLookAngles(observerGd, positionEcf);
    return rad2deg(look.elevation);
  } catch {
    return null;
  }
}

export function buildOrbitTrack(
  row: TleRow,
  start: Date,
  minutesForward = 90,
  stepSeconds = 120
): { lat: number; lon: number; altKm: number }[] {
  const samples: { lat: number; lon: number; altKm: number }[] = [];
  const totalSeconds = minutesForward * 60;

  for (let offset = 0; offset <= totalSeconds; offset += stepSeconds) {
    const sample = propagatePositionDeg(row, new Date(start.getTime() + offset * 1000));
    if (sample) samples.push(sample);
  }

  return samples;
}
