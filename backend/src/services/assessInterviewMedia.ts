import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { env } from "../env";
import { logger } from "../utils/logger";
import { AppDataSource } from "../data-source";

export const assessInterviewMediaEnabled = () => env.__liveKitEnabled;
let mediaProbe: Promise<boolean> | null = null;
let probeExpiresAt = 0;
let probeAvailable = false;
async function mediaReachable(): Promise<boolean> {
  if (Date.now() < probeExpiresAt) return probeAvailable;
  mediaProbe ??= (async () => {
    try {
      const url = env.__liveKitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
      await new RoomServiceClient(url, env.__liveKitApiKey, env.__liveKitApiSecret, { requestTimeout: 4 }).listRooms(["talent_connection_check"]);
      probeAvailable = true;
    } catch { probeAvailable = false; }
    probeExpiresAt = Date.now() + (probeAvailable ? 30_000 : 5_000);
    return probeAvailable;
  })().finally(() => { mediaProbe = null; });
  return mediaProbe;
}
export async function assessInterviewMediaToken(room: string, userId: number, name: string) {
  if (!assessInterviewMediaEnabled() || !await mediaReachable()) return null;
  const token = new AccessToken(env.__liveKitApiKey, env.__liveKitApiSecret, { identity: `talent-user-${userId}`, name, ttl: 300 });
  token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: false, roomAdmin: false });
  return { token: await token.toJwt(), url: env.__liveKitUrl, identity: `talent-user-${userId}` };
}
export async function closeAssessInterviewMediaRoom(roomName: string): Promise<void> {
  if (!assessInterviewMediaEnabled()) return;
  try {
    const url = env.__liveKitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    await new RoomServiceClient(url, env.__liveKitApiKey, env.__liveKitApiSecret, { requestTimeout: 4 }).deleteRoom(roomName);
  } catch (error) {
    logger.warn("[assess-interview] media room could not be closed", { error: error instanceof Error ? error.message : "MEDIA_CLOSE_FAILED" });
  }
}
export async function removeAssessInterviewParticipant(roomName: string, userId: number): Promise<void> {
  if (!assessInterviewMediaEnabled()) return;
  try {
    const url = env.__liveKitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    await new RoomServiceClient(url, env.__liveKitApiKey, env.__liveKitApiSecret, { requestTimeout: 4 })
      .removeParticipant(roomName, `talent-user-${userId}`);
  } catch (error) {
    logger.warn("[assess-interview] revoked team member could not be removed from media room", { userId, error: error instanceof Error ? error.message : "MEDIA_REMOVE_FAILED" });
  }
}
export async function revokeAssessInterviewAccess(assessmentId: string): Promise<void> {
  const rows = await AppDataSource.query("SELECT id,room_name FROM growth_interviews WHERE assessment_id=? AND status IN ('SCHEDULED','LIVE') LIMIT 20", [assessmentId]) as Array<{ id: string; room_name: string }>;
  await AppDataSource.query("UPDATE growth_interviews SET status='CANCELLED',completed_at=NOW(3) WHERE assessment_id=? AND status IN ('SCHEDULED','LIVE')", [assessmentId]);
  await Promise.allSettled(rows.map(row => closeAssessInterviewMediaRoom(row.room_name)));
}
