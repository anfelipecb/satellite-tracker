import { z } from 'zod';

const launchStatusSchema = z.object({
  id: z.number().optional(),
  name: z.string().optional(),
}).optional();

const launchPadSchema = z.object({
  location: z
    .object({
      name: z.string().optional(),
    })
    .optional(),
}).optional();

const rocketSchema = z
  .object({
    configuration: z
      .object({
        full_name: z.string().optional(),
      })
      .optional(),
  })
  .optional();

export const launchLibraryResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  net: z.string().nullable().optional(),
  status: launchStatusSchema,
  pad: launchPadSchema,
  rocket: rocketSchema,
  launch_service_provider: z
    .object({
      name: z.string().optional(),
    })
    .optional(),
});

export const launchLibraryUpcomingResponseSchema = z.object({
  count: z.number().optional(),
  next: z.string().nullable().optional(),
  previous: z.string().nullable().optional(),
  results: z.array(launchLibraryResultSchema),
});

export type LaunchLibraryResult = z.infer<typeof launchLibraryResultSchema>;
