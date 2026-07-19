import React, { useEffect, useMemo, memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import type { Pluggable, PluggableList } from "unified";
import remarkGfm from "remark-gfm";
import { decodeEscapedInputText, normalizeMarkdownEscapes } from "../utils/inputTextNormalization";
import { InteractiveBlock, parseInteractiveSpec } from "./theory/InteractiveBlock";
const MATH_MARKUP_RE = /(\$\$[^$]+?\$\$)|(\$[^$\n]+?\$)|\\\(|\\\[|\\begin\{/;
const CODE_FENCE_RE = /(^|\n)\s*```[^\n]*\n/;

let katexCssLoadPromise: Promise<unknown> | null = null;

function ensureKatexCssLoaded(): Promise<unknown> {
  if (!katexCssLoadPromise) {
    katexCssLoadPromise = import("katex/dist/katex.min.css");
  }
  return katexCssLoadPromise;
}

interface MarkdownViewProps {
  content: string;
  variant?: "default" | "handbook";
}

const HTTP_PROTOCOLS = new Set(["http:", "https:"]);
const IMAGE_EXT_RE = /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)(?:$|[?#])/i;
const VIDEO_EXT_RE = /\.(m4v|mov|mp4|ogv|ogg|webm)(?:$|[?#])/i;
const VIDEO_EMBED_ALLOW = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";

type VideoEmbedDescriptor =
  | {
      kind: "iframe";
      embedUrl: string;
      sourceUrl: string;
      title: string;
      providerLabel: string;
      allow: string;
      allowFullScreen?: boolean;
    }
  | {
      kind: "direct";
      sourceUrl: string;
      title: string;
    };

type HastNode = {
  type?: string;
  value?: unknown;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: unknown[];
};

function parseHttpUrl(raw: string): URL | null {
  try {
    const parsed = new URL(String(raw || "").trim());
    if (!HTTP_PROTOCOLS.has(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function sanitizeHref(raw: string | undefined): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;

  if (value.startsWith("#") || value.startsWith("/")) return value;

  const schemeMatch = value.match(/^([a-zA-Z][a-zA-Z\d+\-.]*):/);
  if (!schemeMatch) return value;

  const scheme = `${schemeMatch[1].toLowerCase()}:`;
  if (scheme === "http:" || scheme === "https:" || scheme === "mailto:" || scheme === "tel:") {
    return value;
  }

  return null;
}

function looksLikeImageUrl(raw: string): boolean {
  const url = parseHttpUrl(raw);
  if (!url) return false;
  return IMAGE_EXT_RE.test(`${url.pathname}${url.search}`);
}

function looksLikeDirectVideoUrl(raw: string): boolean {
  const url = parseHttpUrl(raw);
  if (!url) return false;
  return VIDEO_EXT_RE.test(`${url.pathname}${url.search}`);
}

function parseHmsTimestamp(raw: string | null): number | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;

  if (/^\d+$/.test(value)) {
    const sec = Number(value);
    return Number.isFinite(sec) && sec > 0 ? sec : null;
  }

  const m = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return null;
  const h = Number(m[1] || 0);
  const min = Number(m[2] || 0);
  const sec = Number(m[3] || 0);
  const total = h * 3600 + min * 60 + sec;
  return total > 0 ? total : null;
}

function extractYouTubeVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    const candidate = parts[0] || "";
    return /^[a-zA-Z0-9_-]{6,20}$/.test(candidate) ? candidate : null;
  }

  if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    const qv = url.searchParams.get("v") || "";
    if (/^[a-zA-Z0-9_-]{6,20}$/.test(qv)) return qv;

    const markers = new Set(["embed", "shorts", "live", "v"]);
    for (let i = 0; i < parts.length; i += 1) {
      if (!markers.has(parts[i])) continue;
      const candidate = parts[i + 1] || "";
      if (/^[a-zA-Z0-9_-]{6,20}$/.test(candidate)) return candidate;
    }
  }

  return null;
}

function extractVimeoVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "player.vimeo.com" && parts[0] === "video" && /^\d+$/.test(parts[1] || "")) {
    return parts[1];
  }

  if (host.endsWith("vimeo.com")) {
    const numericSegment = parts.find((segment) => /^\d+$/.test(segment));
    if (numericSegment) return numericSegment;
  }

  return null;
}

function extractDailymotionVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "dai.ly") {
    const candidate = parts[0] || "";
    return /^[a-zA-Z0-9]+$/.test(candidate) ? candidate : null;
  }

  if (host.endsWith("dailymotion.com")) {
    const idx = parts.indexOf("video");
    if (idx >= 0) {
      const candidate = parts[idx + 1] || "";
      return /^[a-zA-Z0-9]+$/.test(candidate) ? candidate : null;
    }
  }

  return null;
}

function extractLoomVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!host.endsWith("loom.com")) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "share" || parts[0] === "embed") {
    const candidate = parts[1] || "";
    return /^[a-zA-Z0-9_-]{6,}$/.test(candidate) ? candidate : null;
  }

  return null;
}

function extractGoogleDriveFileId(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "drive.google.com") return null;

  const parts = url.pathname.split("/").filter(Boolean);
  const dIndex = parts.indexOf("d");
  if (dIndex >= 0) {
    const candidate = parts[dIndex + 1] || "";
    return /^[a-zA-Z0-9_-]{10,}$/.test(candidate) ? candidate : null;
  }

  return null;
}

function getEmbeddableVideo(raw: string): VideoEmbedDescriptor | null {
  const url = parseHttpUrl(raw);
  if (!url) return null;

  if (looksLikeDirectVideoUrl(url.toString())) {
    return {
      kind: "direct",
      sourceUrl: url.toString(),
      title: "Embedded video"
    };
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  const ytId = extractYouTubeVideoId(url);
  if (ytId) {
    const params = new URLSearchParams({
      rel: "0",
      modestbranding: "1"
    });
    const start = parseHmsTimestamp(url.searchParams.get("t") ?? url.searchParams.get("start"));
    if (start && start > 0) {
      params.set("start", String(start));
    }

    return {
      kind: "iframe",
      embedUrl: `https://www.youtube.com/embed/${ytId}?${params.toString()}`,
      sourceUrl: url.toString(),
      title: "YouTube video",
      providerLabel: "YouTube",
      allow: VIDEO_EMBED_ALLOW,
      allowFullScreen: true
    };
  }

  const vimeoId = extractVimeoVideoId(url);
  if (vimeoId) {
    return {
      kind: "iframe",
      embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
      sourceUrl: url.toString(),
      title: "Vimeo video",
      providerLabel: "Vimeo",
      allow: VIDEO_EMBED_ALLOW,
      allowFullScreen: true
    };
  }

  const dailymotionId = extractDailymotionVideoId(url);
  if (dailymotionId) {
    return {
      kind: "iframe",
      embedUrl: `https://www.dailymotion.com/embed/video/${dailymotionId}`,
      sourceUrl: url.toString(),
      title: "Dailymotion video",
      providerLabel: "Dailymotion",
      allow: VIDEO_EMBED_ALLOW,
      allowFullScreen: true
    };
  }

  const loomId = extractLoomVideoId(url);
  if (loomId) {
    return {
      kind: "iframe",
      embedUrl: `https://www.loom.com/embed/${loomId}`,
      sourceUrl: url.toString(),
      title: "Loom video",
      providerLabel: "Loom",
      allow: VIDEO_EMBED_ALLOW,
      allowFullScreen: true
    };
  }

  const driveId = extractGoogleDriveFileId(url);
  if (driveId) {
    return {
      kind: "iframe",
      embedUrl: `https://drive.google.com/file/d/${driveId}/preview`,
      sourceUrl: url.toString(),
      title: "Google Drive video",
      providerLabel: "Google Drive",
      allow: VIDEO_EMBED_ALLOW,
      allowFullScreen: true
    };
  }

  // Generic fallback for links that are already in /embed/... format.
  if (/\/embed\//i.test(url.pathname) || host.startsWith("player.")) {
    return {
      kind: "iframe",
      embedUrl: url.toString(),
      sourceUrl: url.toString(),
      title: "Embedded video",
      providerLabel: url.hostname,
      allow: VIDEO_EMBED_ALLOW,
      allowFullScreen: true
    };
  }

  return null;
}

function asHastNode(value: unknown): HastNode | null {
  if (!value || typeof value !== "object") return null;
  return value as HastNode;
}

function getTextFromHast(node: HastNode | null): string {
  if (!node) return "";
  if (node.type === "text") return typeof node.value === "string" ? node.value : "";
  if (!Array.isArray(node.children)) return "";
  return node.children.map((child) => getTextFromHast(asHastNode(child))).join("");
}

function getStandaloneParagraphLink(node: unknown): {
  href: string;
  label: string;
} | null {
  const paragraph = asHastNode(node);
  if (!paragraph || paragraph.type !== "element" || paragraph.tagName !== "p") return null;

  const children = Array.isArray(paragraph.children) ? paragraph.children.map(asHastNode).filter((x): x is HastNode => Boolean(x)) : [];
  const meaningfulChildren = children.filter((child) => {
    if (child.type !== "text") return true;
    return String(child.value || "").trim().length > 0;
  });

  if (meaningfulChildren.length !== 1) return null;

  const only = meaningfulChildren[0];
  if (only.type !== "element" || only.tagName !== "a") return null;

  const hrefRaw = only.properties?.href;
  const href = typeof hrefRaw === "string" ? hrefRaw.trim() : "";
  if (!href) return null;

  return {
    href,
    label: getTextFromHast(only).trim()
  };
}

const EmbeddedImage: React.FC<{ src: string; altText?: string }> = ({
  src,
  altText
}) => {
  const alt = String(altText || "").trim() || "Embedded image";
  return <figure className="my-5 overflow-hidden rounded-xl border border-border bg-bg-surface">
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="block transition-opacity duration-200 hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
      >
        <img src={src} alt={alt} loading="lazy" decoding="async" className="block w-full max-h-[70vh] object-contain bg-bg-surface" />
      </a>
      {String(altText || "").trim() ? <figcaption className="border-t border-border px-3 py-2 text-xs text-text-secondary">{altText}</figcaption> : null}
    </figure>;
};

const EmbeddedVideo: React.FC<{
  descriptor: VideoEmbedDescriptor;
  caption?: string;
}> = ({
  descriptor,
  caption
}) => {
  const title = String(caption || "").trim() || descriptor.title;

  return <div className="my-5 overflow-hidden rounded-xl border border-border bg-bg-surface">
      {descriptor.kind === "iframe" ? <div className="relative w-full pb-[56.25%]">
          <iframe
            src={descriptor.embedUrl}
            title={title}
            className="absolute inset-0 h-full w-full border-0"
            loading="lazy"
            allow={descriptor.allow}
            allowFullScreen={descriptor.allowFullScreen !== false}
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div> : <video controls preload="metadata" className="block w-full bg-bg-code" src={descriptor.sourceUrl} />}
      {String(caption || "").trim() ? <div className="border-t border-border px-3 py-2 text-xs text-text-secondary">{caption}</div> : null}
    </div>;
};

type SyntaxHighlighterProps = {
  language?: string;
  style?: unknown;
  customStyle?: React.CSSProperties;
  PreTag?: React.ElementType;
  children?: React.ReactNode;
};
type SyntaxHighlighterComponent = React.ComponentType<SyntaxHighlighterProps> | null;
type SyntaxHighlighterStyle = unknown;
type SyntaxHighlighterModule = {
  Prism?: React.ComponentType<SyntaxHighlighterProps>;
  default?: React.ComponentType<SyntaxHighlighterProps>;
};
type PrismLightComponent = React.ComponentType<SyntaxHighlighterProps> & {
  registerLanguage?: (languageName: string, syntax: unknown) => void;
};
type PrismStylesModule = {
  vscDarkPlus?: unknown;
};
type MathPluginBundle = {
  remarkMath: Pluggable | null;
  rehypeKatex: Pluggable | null;
};

const PlainCodeBlock: React.FC<{ code: string }> = ({ code }) => {
  return <pre className="my-4 max-w-full overflow-x-auto whitespace-pre-wrap rounded-2xl border border-border/80 bg-bg-code/80 p-4 text-sm leading-relaxed shadow-sm">
      <code className="whitespace-pre-wrap break-words font-mono text-text-primary">{code}</code>
    </pre>;
};

export const MarkdownView: React.FC<MarkdownViewProps> = memo(({
  content,
  variant = "default"
}) => {
  const [SyntaxHighlighter, setSyntaxHighlighter] = useState<SyntaxHighlighterComponent>(null);
  const [syntaxStyle, setSyntaxStyle] = useState<SyntaxHighlighterStyle>(null);
  const [mathPlugins, setMathPlugins] = useState<MathPluginBundle>({
    remarkMath: null,
    rehypeKatex: null
  });
  const hasMathMarkup = useMemo(() => MATH_MARKUP_RE.test(content), [content]);
  const hasCodeFences = useMemo(() => CODE_FENCE_RE.test(content), [content]);

  // Lazily load heavy syntax highlighting only when MarkdownView is actually used.
  // This avoids pulling ~hundreds of KB into the initial bundle.
  useEffect(() => {
    if (!hasCodeFences) return;
    let cancelled = false;

    Promise.all([
      import("react-syntax-highlighter/dist/esm/prism-light"),
      import("react-syntax-highlighter/dist/esm/styles/prism"),
      import("react-syntax-highlighter/dist/esm/languages/prism/java"),
      import("react-syntax-highlighter/dist/esm/languages/prism/python"),
      import("react-syntax-highlighter/dist/esm/languages/prism/cpp"),
      import("react-syntax-highlighter/dist/esm/languages/prism/c"),
      import("react-syntax-highlighter/dist/esm/languages/prism/javascript"),
      import("react-syntax-highlighter/dist/esm/languages/prism/typescript"),
      import("react-syntax-highlighter/dist/esm/languages/prism/kotlin"),
      import("react-syntax-highlighter/dist/esm/languages/prism/json"),
      import("react-syntax-highlighter/dist/esm/languages/prism/bash"),
      import("react-syntax-highlighter/dist/esm/languages/prism/sql")
    ]).then(([mod, styles, javaLang, pythonLang, cppLang, cLang, jsLang, tsLang, kotlinLang, jsonLang, bashLang, sqlLang]) => {
      if (cancelled) return;
      const syntaxModule = mod as SyntaxHighlighterModule & {
        default?: PrismLightComponent;
      };
      const stylesModule = styles as PrismStylesModule;
      const Highlighter = (syntaxModule.default ?? syntaxModule.Prism ?? null) as PrismLightComponent | null;
      if (Highlighter?.registerLanguage) {
        Highlighter.registerLanguage("java", javaLang.default);
        Highlighter.registerLanguage("python", pythonLang.default);
        Highlighter.registerLanguage("cpp", cppLang.default);
        Highlighter.registerLanguage("c", cLang.default);
        Highlighter.registerLanguage("javascript", jsLang.default);
        Highlighter.registerLanguage("js", jsLang.default);
        Highlighter.registerLanguage("typescript", tsLang.default);
        Highlighter.registerLanguage("ts", tsLang.default);
        Highlighter.registerLanguage("kotlin", kotlinLang.default);
        Highlighter.registerLanguage("json", jsonLang.default);
        Highlighter.registerLanguage("bash", bashLang.default);
        Highlighter.registerLanguage("sh", bashLang.default);
        Highlighter.registerLanguage("sql", sqlLang.default);
      }
      setSyntaxHighlighter(() => Highlighter);
      setSyntaxStyle(stylesModule.vscDarkPlus ?? null);
    }).catch(() => {
      // Ignore: if dynamic import fails, we just render plain code blocks.
    });

    return () => {
      cancelled = true;
    };
  }, [hasCodeFences]);

  useEffect(() => {
    if (!hasMathMarkup) {
      setMathPlugins(prev => (prev.remarkMath || prev.rehypeKatex ? {
        remarkMath: null,
        rehypeKatex: null
      } : prev));
      return;
    }
    let active = true;
    Promise.all([
      ensureKatexCssLoaded(),
      import("remark-math"),
      import("rehype-katex")
    ]).then(([, remarkMathModule, rehypeKatexModule]) => {
      if (!active) return;
      setMathPlugins({
        remarkMath: remarkMathModule.default ?? null,
        rehypeKatex: rehypeKatexModule.default ?? null
      });
    }).catch(error => {
      if (import.meta.env.DEV && active) {
        console.error("Failed to load markdown math dependencies:", error);
      }
    });
    return () => {
      active = false;
    };
  }, [hasMathMarkup]);

  const remarkPlugins = useMemo(() => {
    const plugins: PluggableList = [remarkGfm];
    if (mathPlugins.remarkMath) plugins.push(mathPlugins.remarkMath);
    return plugins;
  }, [mathPlugins.remarkMath]);

  const rehypePlugins = useMemo(() => {
    if (!mathPlugins.rehypeKatex) return [] as PluggableList;
    return [mathPlugins.rehypeKatex];
  }, [mathPlugins.rehypeKatex]);

  const codeComponents = useMemo<Pick<Components, "code" | "a" | "img" | "p" | "pre">>(() => ({
    code({
      node,
      inline,
      className,
      children,
      ...props
    }: React.ComponentPropsWithoutRef<"code"> & {
      node?: unknown;
      inline?: boolean;
    }) {
      const match = /language-(\w+)/.exec(className || "");
      const language = match ? match[1] : "";
      // react-markdown 10 no longer reliably provides the old `inline` prop.
      // Fenced blocks are normalized to a language below, so an unclassified
      // code node is an inline snippet when the prop is absent.
      const isInlineCode = inline !== false && !match;

      if (!isInlineCode && language === "interactive") {
        const raw = String(children).replace(/\n$/, "");
        const spec = parseInteractiveSpec(raw);
        if (spec) return <InteractiveBlock spec={spec} />;
        return <PlainCodeBlock code={raw} />;
      }
      if (!isInlineCode && match && language !== "text") {
        const code = decodeEscapedInputText(String(children).replace(/\n$/, ""));
        if (!SyntaxHighlighter || !syntaxStyle) {
          return <PlainCodeBlock code={code} />;
        }
        return <div className="my-4 overflow-hidden border border-border">
              <SyntaxHighlighter language={language} style={syntaxStyle} customStyle={{
            margin: 0,
            padding: "1rem",
            fontSize: "0.875rem",
            lineHeight: "1.5",
            background: "var(--bg-code)"
          }} PreTag="div" {...props}>
                {code}
              </SyntaxHighlighter>
            </div>;
      }
      if (!isInlineCode) {
        const code = decodeEscapedInputText(String(children).replace(/\n$/, ""));
        return <PlainCodeBlock code={code} />;
      }
      const inlineCode = decodeEscapedInputText(String(children ?? ""));
      const hasMultilineInline = inlineCode.includes("\n");
      return <code
        className={`max-w-full rounded-md bg-bg-code border border-border px-1.5 py-0.5 text-sm font-mono text-text-primary ${hasMultilineInline ? "whitespace-pre-wrap inline-block align-top break-words" : "break-words"}`}
        {...props}
      >
        {inlineCode}
      </code>;
    },
    // Custom code blocks already include their own container. Removing the
    // default wrapper prevents invalid <pre><pre> nesting and excess spacing.
    pre({ children }: React.ComponentPropsWithoutRef<"pre">) {
      return <>{children}</>;
    },
    a({
      href,
      children,
      className,
      ...props
      }: React.ComponentPropsWithoutRef<"a"> & {
      node?: unknown;
    }) {
      const safeHref = sanitizeHref(typeof href === "string" ? href : undefined);
      if (!safeHref) {
        return <span className="text-text-muted">{children}</span>;
      }

      const isExternal = /^https?:\/\//i.test(safeHref);
      const linkClassName = `decoration-secondary/70 decoration-1 underline-offset-2 transition-colors duration-150 hover:text-secondary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base ${className ?? ""}`.trim();
      return <a
        href={safeHref}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer nofollow" : undefined}
        className={linkClassName}
        {...props}
      >
          {children}
        </a>;
    },
    img({
      src,
      alt
    }: React.ComponentPropsWithoutRef<"img"> & {
      node?: unknown;
    }) {
      const safeSrc = sanitizeHref(typeof src === "string" ? src : undefined);
      if (!safeSrc) {
        return <span className="text-xs text-text-muted">{alt || "Image is unavailable"}</span>;
      }

      return <EmbeddedImage src={safeSrc} altText={typeof alt === "string" ? alt : undefined} />;
    },
    p({
      node,
      children,
      ...props
    }: React.ComponentPropsWithoutRef<"p"> & {
      node?: unknown;
    }) {
      const standaloneLink = getStandaloneParagraphLink(node);
      if (standaloneLink) {
        const maybeCaption = standaloneLink.label && standaloneLink.label !== standaloneLink.href ? standaloneLink.label : undefined;

        if (looksLikeImageUrl(standaloneLink.href)) {
          return <EmbeddedImage src={standaloneLink.href} altText={maybeCaption} />;
        }

        const videoDescriptor = getEmbeddableVideo(standaloneLink.href);
        if (videoDescriptor) {
          return <EmbeddedVideo descriptor={videoDescriptor} caption={maybeCaption} />;
        }
      }

      return <p {...props}>{children}</p>;
    }
  }), [SyntaxHighlighter, syntaxStyle]);
  const processedContent = useMemo(() => {
    if (!content) return "";
    let processed = normalizeMarkdownEscapes(content);
    processed = processed.replace(/\\\(/g, "$").replace(/\\\)/g, "$").replace(/\\\[/g, "$$").replace(/\\\]/g, "$$");
    processed = processed.replace(/\\textbf\{([^}]+)\}/g, "**$1**");
    processed = processed.replace(/\\textit\{([^}]+)\}/g, "*$1*");
    processed = processed.replace(/\\emph\{([^}]+)\}/g, "*$1*");
    // react-markdown 10 does not expose the parent <pre> to the `code`
    // renderer. Give language-less fenced blocks an explicit marker so they
    // remain blocks while backtick snippets inside prose stay inline.
    processed = processed.replace(/(^|\n)([ \t]*)```[ \t]*(?=\n)/g, "$1$2```text");
    return processed;
  }, [content]);
  return <div className={`${variant === "handbook" ? "docs-handbook-prose font-sans" : "font-sans prose-invert"} prose max-w-none
      prose-pre:bg-transparent prose-pre:p-0 prose-pre:my-4 prose-pre:border-0
      prose-code:bg-bg-code prose-code:px-1.5 prose-code:py-0.5 prose-code:border prose-code:border-border prose-code:text-sm prose-code:font-mono prose-code:text-text-primary
      prose-code:before:content-[''] prose-code:after:content-['']
      prose-p:leading-relaxed prose-p:text-text-primary prose-p:text-sm
      prose-headings:text-text-primary prose-headings:font-semibold
      prose-strong:text-text-primary prose-strong:font-semibold
      prose-ul:text-text-primary prose-ol:text-text-primary
      prose-li:text-text-primary
      prose-a:text-secondary prose-a:no-underline hover:prose-a:underline
      prose-img:rounded prose-img:border prose-img:border-border
      prose-img:my-4 prose-img:max-w-full prose-img:cursor-zoom-in
      prose-blockquote:rounded-xl prose-blockquote:border prose-blockquote:border-border
      prose-blockquote:bg-bg-surface/60 prose-blockquote:px-4 prose-blockquote:py-3
      prose-blockquote:not-italic prose-blockquote:my-4
      prose-blockquote:[&>p]:text-text-primary prose-blockquote:[&>p]:text-sm
      prose-blockquote:[&>p>code]:text-text-primary
      [&_.katex]:!text-text-primary
      [&_.katex-display]:my-4
      [&_.katex-display]:!text-text-primary
      [&_.katex_mathit]:!text-text-primary
      [&_.katex_main]:!text-text-primary
      [&_.katex_math]:!text-text-primary
      [&_.katex]:!bg-transparent`}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={codeComponents}>
        {processedContent}
      </ReactMarkdown>
    </div>;
});
MarkdownView.displayName = "MarkdownView";
