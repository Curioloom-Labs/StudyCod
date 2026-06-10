import { AccessToken } from "livekit-server-sdk";
import { env } from "../../env";

export type LiveRole = "host" | "participant";

export interface MintTokenInput {
  /** Stable LiveKit room name (the EduLiveSession.roomName). */
  room: string;
  /**
   * Unique participant identity within the room. We namespace by principal type
   * so a teacher (user) and a student can never collide on the same identity.
   */
  identity: string;
  /** Human-readable display name shown to other participants. */
  name: string;
  role: LiveRole;
}

export interface MintedToken {
  token: string;
  url: string;
  identity: string;
  room: string;
  role: LiveRole;
}

/**
 * The live, code-aware classroom needs a configured LiveKit SFU. When any of
 * the three secrets is missing the feature is off — callers should surface a
 * clear 503 rather than minting unusable tokens.
 */
export function isLiveClassroomEnabled(): boolean {
  return env.__liveKitEnabled;
}

export function liveClassroomServerUrl(): string {
  return env.__liveKitUrl;
}

/**
 * Mint a short-lived LiveKit join token. The host (teacher) gets room-admin
 * rights (mute others, end room, manage participants); participants (students)
 * can publish their camera/mic and data but not administer the room. Both can
 * publish data — that channel carries the code-aware events (run, verdict,
 * cursor) on top of audio/video.
 */
export async function mintRoomToken(input: MintTokenInput): Promise<MintedToken> {
  if (!isLiveClassroomEnabled()) {
    throw new Error("LIVE_CLASSROOM_DISABLED");
  }

  const ttlSeconds = env.__liveKitTokenTtlMinutes * 60;
  const at = new AccessToken(env.__liveKitApiKey, env.__liveKitApiSecret, {
    identity: input.identity,
    name: input.name,
    ttl: ttlSeconds
  });

  const isHost = input.role === "host";
  at.addGrant({
    roomJoin: true,
    room: input.room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: isHost
  });

  const token = await at.toJwt();
  return {
    token,
    url: env.__liveKitUrl,
    identity: input.identity,
    room: input.room,
    role: input.role
  };
}

export function teacherIdentity(userId: number): string {
  return `user-${userId}`;
}

export function studentIdentity(studentId: number): string {
  return `student-${studentId}`;
}
