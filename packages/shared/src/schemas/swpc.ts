import { z } from 'zod';

/** NOAA SWPC planetary K-index 1-minute JSON */
export const swpcKpRowSchema = z.object({
  time_tag: z.string(),
  kp_index: z.union([z.number(), z.string()]),
  estimated_kp: z.union([z.number(), z.string()]).optional(),
  kp: z.union([z.number(), z.string()]).optional(),
});

export const swpcKpResponseSchema = z.array(swpcKpRowSchema);

export type SwpcKpRow = z.infer<typeof swpcKpRowSchema>;
