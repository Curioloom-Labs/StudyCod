import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDataChannel } from "@livekit/components-react";
import { tr } from "../i18n";
import { CodeEditor } from "./CodeEditor";

type BoardLang = "JAVA" | "PYTHON" | "CPP";

type BoardMessage =
  | { type: "sync"; code: string; lang: BoardLang; line: number }
  | { type: "cursor"; line: number };

const TOPIC = "codeboard";
const HEARTBEAT_MS = 2000; // re-broadcast so late-openers catch up
const SEND_THROTTLE_MS = 400;
const CURSOR_THROTTLE_MS = 150;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Shared live code board for the live lesson, synced over the LiveKit data
 * channel. The teacher types and everyone sees it in real time, and the
 * teacher's current line is broadcast as a "pointer" — highlighted in every
 * student's mirror with the view following along. Students get a read-only
 * editor. A heartbeat re-broadcasts state so a student who opens the board
 * mid-lesson catches up within a couple of seconds.
 */
export const LiveCodeBoard: React.FC<{ isTeacher: boolean }> = ({ isTeacher }) => {
  const [code, setCode] = useState("");
  const [lang, setLang] = useState<BoardLang>("JAVA");

  // Latest values in refs so the heartbeat always sends current state.
  const codeRef = useRef(code);
  const langRef = useRef(lang);
  const lineRef = useRef(1);
  codeRef.current = code;
  langRef.current = lang;

  // Student-side Monaco handles for applying the teacher's pointer decoration.
  const stuEditorRef = useRef<any>(null);
  const stuMonacoRef = useRef<any>(null);
  const decoIdsRef = useRef<string[]>([]);

  const applyTeacherLine = useCallback((line: number) => {
    const editor = stuEditorRef.current;
    const monaco = stuMonacoRef.current;
    if (!editor || !monaco || !Number.isFinite(line) || line < 1) return;
    try {
      decoIdsRef.current = editor.deltaDecorations(decoIdsRef.current, [
        {
          range: new monaco.Range(line, 1, line, 1),
          options: { isWholeLine: true, className: "lk-teacher-line" }
        }
      ]);
      editor.revealLineInCenterIfOutsideViewport(line);
    } catch {
      /* decoration is best-effort */
    }
  }, []);

  const onMessage = useCallback(
    (msg: { payload: Uint8Array }) => {
      if (isTeacher) return; // teacher is the source of truth
      try {
        const parsed = JSON.parse(decoder.decode(msg.payload)) as BoardMessage;
        if (parsed.type === "sync") {
          setCode(parsed.code ?? "");
          if (parsed.lang === "JAVA" || parsed.lang === "PYTHON" || parsed.lang === "CPP") setLang(parsed.lang);
          applyTeacherLine(parsed.line);
        } else if (parsed.type === "cursor") {
          applyTeacherLine(parsed.line);
        }
      } catch {
        /* ignore malformed frames */
      }
    },
    [isTeacher, applyTeacherLine]
  );

  const { send } = useDataChannel(TOPIC, onMessage);

  const sendMessage = useCallback(
    (msg: BoardMessage) => {
      try {
        void send(encoder.encode(JSON.stringify(msg)), { reliable: true });
      } catch {
        /* channel not ready yet */
      }
    },
    [send]
  );

  const broadcastSync = useCallback(() => {
    if (!isTeacher) return;
    sendMessage({ type: "sync", code: codeRef.current, lang: langRef.current, line: lineRef.current });
  }, [isTeacher, sendMessage]);

  // Teacher heartbeat so late openers/joiners get the current board.
  useEffect(() => {
    if (!isTeacher) return;
    const id = window.setInterval(broadcastSync, HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [isTeacher, broadcastSync]);

  // Throttled full sync on edit.
  const syncThrottleRef = useRef<number | null>(null);
  const handleChange = useCallback(
    (next: string) => {
      setCode(next);
      if (!isTeacher) return;
      if (syncThrottleRef.current) return;
      syncThrottleRef.current = window.setTimeout(() => {
        syncThrottleRef.current = null;
        broadcastSync();
      }, SEND_THROTTLE_MS);
    },
    [isTeacher, broadcastSync]
  );

  // Wire Monaco once mounted: teacher broadcasts cursor line; student stores
  // refs so incoming pointer updates can be decorated.
  const cursorThrottleRef = useRef<number | null>(null);
  const handleEditorMount = useCallback(
    (editor: any, monaco: any) => {
      if (isTeacher) {
        editor.onDidChangeCursorPosition((e: any) => {
          lineRef.current = e?.position?.lineNumber ?? 1;
          if (cursorThrottleRef.current) return;
          cursorThrottleRef.current = window.setTimeout(() => {
            cursorThrottleRef.current = null;
            sendMessage({ type: "cursor", line: lineRef.current });
          }, CURSOR_THROTTLE_MS);
        });
      } else {
        stuEditorRef.current = editor;
        stuMonacoRef.current = monaco;
      }
    },
    [isTeacher, sendMessage]
  );

  return (
    <div className="flex h-full flex-col bg-bg-base">
      {/* Teacher pointer highlight for the student mirror (Monaco decoration class). */}
      <style>{`.lk-teacher-line{background:rgba(0,255,136,0.14);box-shadow:inset 3px 0 0 0 var(--primary,#00ff88);}`}</style>
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-[11px] font-mono text-primary">
          📝 {tr("Дошка коду", "Code board")}
          <span className="ml-2 text-text-muted">
            {isTeacher ? tr("(ви ведете)", "(you're driving)") : tr("(перегляд)", "(view-only)")}
          </span>
        </span>
        {isTeacher ? (
          <select
            id="live-code-language"
            name="language"
            aria-label={tr("Мова коду", "Code language")}
            value={lang}
            onChange={(e) => {
              setLang(e.target.value as BoardLang);
              window.setTimeout(broadcastSync, 0);
            }}
            className="rounded border border-border bg-bg-code px-2 py-0.5 text-[11px] font-mono text-text-primary focus:border-primary focus:outline-none"
          >
            <option value="JAVA">Java</option>
            <option value="PYTHON">Python</option>
            <option value="CPP">C++</option>
          </select>
        ) : (
          <span className="text-[11px] font-mono text-text-muted">{lang}</span>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <CodeEditor
          value={code}
          onChange={isTeacher ? handleChange : undefined}
          language={lang}
          readOnly={!isTeacher}
          onEditorMount={handleEditorMount}
        />
      </div>
    </div>
  );
};

export default LiveCodeBoard;
