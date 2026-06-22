import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates
} from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

/**
 * Live-coding P2/P3. Standard Yjs sync + awareness protocol over an injected
 * byte transport. Decoupled from LiveKit so it's unit-verifiable with a mock
 * transport (two providers + a bus → docs converge). The LiveKit data-channel
 * adapter is {@link createLiveKitTransport}.
 */

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

export interface CollabTransport {
  /** Broadcast bytes to the other peers in the doc's channel. */
  send(data: Uint8Array): void;
  /** Subscribe to inbound bytes; returns an unsubscribe fn. */
  subscribe(handler: (data: Uint8Array) => void): () => void;
}

export class LiveKitYjsProvider {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  private transport: CollabTransport;
  private unsub: () => void;
  private docUpdateHandler: (update: Uint8Array, origin: unknown) => void;
  private awarenessHandler: (changes: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => void;

  constructor(doc: Y.Doc, awareness: Awareness, transport: CollabTransport) {
    this.doc = doc;
    this.awareness = awareness;
    this.transport = transport;

    // Local doc edits → broadcast as a sync update (skip echoes we applied).
    this.docUpdateHandler = (update, origin) => {
      if (origin === this) return;
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      syncProtocol.writeUpdate(enc, update);
      transport.send(encoding.toUint8Array(enc));
    };
    doc.on("update", this.docUpdateHandler);

    // Local awareness changes → broadcast.
    this.awarenessHandler = ({ added, updated, removed }, origin) => {
      if (origin === this) return;
      const changed = added.concat(updated, removed);
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_AWARENESS);
      encoding.writeVarUint8Array(enc, encodeAwarenessUpdate(awareness, changed));
      transport.send(encoding.toUint8Array(enc));
    };
    awareness.on("update", this.awarenessHandler);

    this.unsub = transport.subscribe((data) => this.onMessage(data));

    // Kick off the handshake: announce our state vector so peers send what we miss.
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeSyncStep1(enc, doc);
    transport.send(encoding.toUint8Array(enc));

    // Announce our awareness if we have local state.
    if (awareness.getLocalState() !== null) {
      const aenc = encoding.createEncoder();
      encoding.writeVarUint(aenc, MSG_AWARENESS);
      encoding.writeVarUint8Array(aenc, encodeAwarenessUpdate(awareness, [doc.clientID]));
      transport.send(encoding.toUint8Array(aenc));
    }
  }

  private onMessage(data: Uint8Array): void {
    const dec = decoding.createDecoder(data);
    const type = decoding.readVarUint(dec);
    if (type === MSG_SYNC) {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      // Applies incoming update/step with origin=this (so we don't rebroadcast);
      // may write a reply (e.g. step2 answering a peer's step1).
      syncProtocol.readSyncMessage(dec, enc, this.doc, this);
      if (encoding.length(enc) > 1) this.transport.send(encoding.toUint8Array(enc));
    } else if (type === MSG_AWARENESS) {
      applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(dec), this);
    }
  }

  destroy(): void {
    try { this.unsub(); } catch { /* ignore */ }
    this.doc.off("update", this.docUpdateHandler);
    this.awareness.off("update", this.awarenessHandler);
    removeAwarenessStates(this.awareness, [this.doc.clientID], this);
  }
}
