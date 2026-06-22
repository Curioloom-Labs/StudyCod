import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { LiveKitYjsProvider, type CollabTransport } from "./src/lib/collab/LiveKitYjsProvider.ts";
const allHandlers: ((d: Uint8Array) => void)[] = [];
function makeTransport(tag: string): CollabTransport {
  let mine: ((d: Uint8Array) => void) | null = null;
  return { send: (d) => { console.log(`send ${tag} ${d.length}b peers=${allHandlers.length}`); for (const h of allHandlers) if (h !== mine) h(d); },
    subscribe: (h) => { mine = h; allHandlers.push(h); return () => {}; } };
}
const docA = new Y.Doc(), docB = new Y.Doc();
const awA = new Awareness(docA), awB = new Awareness(docB);
docA.getText("code").insert(0, "hello from A");
new LiveKitYjsProvider(docA, awA, makeTransport("A"));
new LiveKitYjsProvider(docB, awB, makeTransport("B"));
console.log("docB=" + JSON.stringify(docB.getText("code").toString()));
