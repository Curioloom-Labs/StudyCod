import React, { useEffect, useMemo, useRef } from "react";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { useRoomContext } from "@livekit/components-react";
import { CollaborativeCodeEditor } from "./CollaborativeCodeEditor";
import { LiveKitYjsProvider } from "../../lib/collab/LiveKitYjsProvider";
import { createLiveKitTransport } from "../../lib/collab/livekitTransport";

/**
 * Live-coding P4: a collaborative editor that syncs over the surrounding LiveKit
 * room's data channel. Must be rendered inside a <LiveKitRoom>. The `topic`
 * scopes the shared doc (e.g. a class scratchpad or a teacher↔student pair).
 *
 * NOTE: real-time behaviour is exercised end-to-end only with ≥2 clients in a
 * live LiveKit room; the sync/awareness protocol itself is verified separately
 * (LiveKitYjsProvider over an in-memory transport).
 */
interface Props {
  topic: string;
  language?: string;
  theme?: "dark" | "light";
  userName?: string;
  readOnly?: boolean;
  height?: string | number;
}

export const LivePairEditor: React.FC<Props> = ({ topic, language = "java", theme = "dark", userName, readOnly = false, height = "100%" }) => {
  const room = useRoomContext();
  const { ydoc, yText, awareness } = useMemo(() => {
    const d = new Y.Doc();
    return { ydoc: d, yText: d.getText("code"), awareness: new Awareness(d) };
  }, []);
  const providerRef = useRef<LiveKitYjsProvider | null>(null);

  useEffect(() => {
    if (!room) return;
    if (userName) awareness.setLocalStateField("user", { name: userName });
    const provider = new LiveKitYjsProvider(ydoc, awareness, createLiveKitTransport(room, topic));
    providerRef.current = provider;
    return () => {
      provider.destroy();
      providerRef.current = null;
    };
    // ydoc/awareness are stable (useMemo); re-subscribe only when room/topic change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, topic]);

  return <CollaborativeCodeEditor yText={yText} awareness={awareness} language={language} theme={theme} readOnly={readOnly} height={height} />;
};
