import React, { useMemo } from "react";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { CollaborativeCodeEditor } from "../../components/edu/CollaborativeCodeEditor";
import { LiveKitYjsProvider, type CollabTransport } from "../../lib/collab/LiveKitYjsProvider";

/**
 * DEV-only demo for Live-coding P1–P3: two collaborative editors, each with its
 * own Y.Doc + Awareness, wired through real LiveKitYjsProviders over an in-memory
 * CollabTransport bus. Exercises the actual sync + awareness protocol (the same
 * code LiveKit will carry in P2) without needing LiveKit.
 */
export const CollabDemoPage: React.FC = () => {
  const { aText, bText, awA, awB } = useMemo(() => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const awA = new Awareness(docA);
    const awB = new Awareness(docB);

    // In-memory broadcast bus standing in for the LiveKit data channel.
    const handlers: ((d: Uint8Array) => void)[] = [];
    const makeTransport = (): CollabTransport => {
      let mine: ((d: Uint8Array) => void) | null = null;
      return {
        send: (d) => { for (const h of handlers) if (h !== mine) h(d); },
        subscribe: (h) => { mine = h; handlers.push(h); return () => { const i = handlers.indexOf(h); if (i >= 0) handlers.splice(i, 1); }; }
      };
    };

    awA.setLocalStateField("user", { name: "Teacher", color: "#00b35f" });
    awB.setLocalStateField("user", { name: "Student", color: "#3b82f6" });
    new LiveKitYjsProvider(docA, awA, makeTransport());
    new LiveKitYjsProvider(docB, awB, makeTransport());

    return { aText: docA.getText("code"), bText: docB.getText("code"), awA, awB };
  }, []);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 12 }}>Collab demo — via LiveKitYjsProvider (in-memory bus)</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>Teacher (A)</div>
          <CollaborativeCodeEditor yText={aText} awareness={awA} height="320px" />
        </div>
        <div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>Student (B)</div>
          <CollaborativeCodeEditor yText={bText} awareness={awB} height="320px" />
        </div>
      </div>
      <p style={{ marginTop: 12, opacity: 0.7, fontSize: 13 }}>Тип у будь-якому редакторі — зміни й курсори синхронізуються через справжній sync/awareness-протокол.</p>
    </div>
  );
};
