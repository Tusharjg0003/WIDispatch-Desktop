// Zod boundary for stored tab sessions. Everything read back from storage was
// written by a possibly older version of this schema, so it arrives unknown.

import { z } from "zod";

export const TAB_SESSION_VERSION = 1;

export const StoredTabSchema = z.object({
  id: z.string().min(1),
  key: z.string().nullable(),
  title: z.string(),
  pinned: z.boolean(),
  permanent: z.boolean(),
  state: z.unknown(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const TabSessionSchema = z.object({
  // A literal, not a minimum: an unrecognised version means the shape is
  // unknown, and starting fresh beats guessing.
  version: z.literal(TAB_SESSION_VERSION),
  activeTabId: z.string().nullable(),
  order: z.array(z.string()),
  tabs: z.array(z.unknown()),
});
