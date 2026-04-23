import { z } from 'zod';

/**
 * Shared shape for N2YO `info` envelopes.
 *
 * `satid` is only present on satellite-specific endpoints (positions / visualpasses);
 * the `above` endpoint returns only { category, transactionscount, satcount }, which
 * is why `satid` must be optional here.
 */
const n2yoInfo = z.object({
  satname: z.string().optional(),
  satid: z.number().optional(),
  transactionscount: z.number().optional(),
  passescount: z.number().optional(),
  satcount: z.number().optional(),
  category: z.string().optional(),
});

export const n2yoPositionSchema = z.object({
  satlatitude: z.number(),
  satlongitude: z.number(),
  sataltitude: z.number(),
  azimuth: z.number(),
  elevation: z.number(),
  ra: z.number().optional(),
  dec: z.number().optional(),
  timestamp: z.number(),
});

export const n2yoPositionsResponseSchema = z.object({
  info: n2yoInfo,
  positions: z.array(n2yoPositionSchema),
});

export const n2yoVisualPassSchema = z.object({
  startAz: z.number(),
  startAzCompass: z.string(),
  startEl: z.number(),
  startUTC: z.number(),
  maxAz: z.number(),
  maxAzCompass: z.string(),
  maxEl: z.number(),
  maxUTC: z.number(),
  endAz: z.number(),
  endAzCompass: z.string(),
  endEl: z.number(),
  endUTC: z.number(),
  mag: z.number(),
  duration: z.number(),
});

export const n2yoVisualPassesResponseSchema = z.object({
  info: n2yoInfo.extend({ passescount: z.number().optional() }),
  passes: z.array(n2yoVisualPassSchema).optional().default([]),
});

export const n2yoAboveSatelliteSchema = z.object({
  satid: z.number(),
  satname: z.string(),
  intDesignator: z.string().optional(),
  launchDate: z.string().optional(),
  satlat: z.number(),
  satlng: z.number(),
  satalt: z.number(),
});

export const n2yoAboveResponseSchema = z.object({
  info: n2yoInfo.extend({ satcount: z.number().optional() }),
  above: z.array(n2yoAboveSatelliteSchema).optional().default([]),
});

export type N2yoPositionsResponse = z.infer<typeof n2yoPositionsResponseSchema>;
export type N2yoVisualPassesResponse = z.infer<typeof n2yoVisualPassesResponseSchema>;
export type N2yoAboveResponse = z.infer<typeof n2yoAboveResponseSchema>;
