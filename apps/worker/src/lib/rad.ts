/** satellite.js ships radiansToDegrees at runtime but types can lag; keep a tiny helper. */
export function rad2deg(radians: number): number {
  return (radians * 180) / Math.PI;
}
