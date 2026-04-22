import { z } from 'zod';

/** One satellite block: name + line1 + line2 */
export const celestrakTleBlockSchema = z.object({
  name: z.string().min(1),
  line1: z.string().min(60),
  line2: z.string().min(60),
});

export type CelestrakTleBlock = z.infer<typeof celestrakTleBlockSchema>;
