import { eq } from "drizzle-orm";

import { uploadVoiceOrderNote } from "@/api/client";
import { db } from "@/db/client";
import { orderNotes } from "@/db/schema";

/** Push local voice files to `/api/order-notes/voice` before outbox sync. */
export async function uploadPendingVoiceNotes(): Promise<void> {
  const rows = await db.select().from(orderNotes);
  const pending = rows.filter((r) => r.voicePath && r.uploadStatus === "pending");
  for (const note of pending) {
    if (!note.voicePath) continue;
    try {
      const res = await uploadVoiceOrderNote(
        note.voicePath,
        note.mimeType ?? "audio/mp4",
        note.voiceDurationSec ?? undefined,
      );
      await db
        .update(orderNotes)
        .set({
          serverId: res.id,
          audioUrl: res.audio_url ?? null,
          uploadStatus: "synced",
          updatedAt: new Date().toISOString(),
        })
        .where(eq(orderNotes.clientId, note.clientId));
    } catch {
      /* remain pending for next cycle */
    }
  }
}
