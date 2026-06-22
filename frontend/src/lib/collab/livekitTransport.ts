import { Room, RoomEvent } from "livekit-client";
import type { CollabTransport } from "./LiveKitYjsProvider";

/**
 * Live-coding P2: a {@link CollabTransport} over a LiveKit room's data channel.
 * Reliable delivery (CRDT correctness) and topic-scoped so multiple docs can
 * share one room. Real-time e2e requires a live LiveKit room with ≥2 clients.
 */
export function createLiveKitTransport(room: Room, topic: string): CollabTransport {
  return {
    send(data: Uint8Array) {
      void room.localParticipant.publishData(data, { reliable: true, topic });
    },
    subscribe(handler: (data: Uint8Array) => void) {
      const onData = (payload: Uint8Array, _participant?: unknown, _kind?: unknown, dataTopic?: string) => {
        if (!dataTopic || dataTopic === topic) handler(payload);
      };
      room.on(RoomEvent.DataReceived, onData as never);
      return () => { room.off(RoomEvent.DataReceived, onData as never); };
    }
  };
}
