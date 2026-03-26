import React, { useEffect, useMemo, memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { decodeEscapedInputText, normalizeMarkdownEscapes } from "../utils/inputTextNormalization";
const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];
interface MarkdownViewProps {
  content: string;
}

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
type PrismStylesModule = {
  vscDarkPlus?: unknown;
};

const PlainCodeBlock: React.FC<{ code: string }> = ({ code }) => {
  return <pre className="my-4 overflow-x-auto border border-border bg-bg-code p-4 text-sm leading-relaxed">
      <code className="font-mono text-text-primary">{code}</code>
    </pre>;
};

export const MarkdownView: React.FC<MarkdownViewProps> = memo(({
  content
}) => {
  const [SyntaxHighlighter, setSyntaxHighlighter] = useState<SyntaxHighlighterComponent>(null);
  const [syntaxStyle, setSyntaxStyle] = useState<SyntaxHighlighterStyle>(null);

  // Lazily load heavy syntax highlighting only when MarkdownView is actually used.
  // This avoids pulling ~hundreds of KB into the initial bundle.
  useEffect(() => {
    let cancelled = false;

    Promise.all([
      import("react-syntax-highlighter"),
      import("react-syntax-highlighter/dist/esm/styles/prism")
    ]).then(([mod, styles]) => {
      if (cancelled) return;
      const syntaxModule = mod as SyntaxHighlighterModule;
      const stylesModule = styles as PrismStylesModule;
      const Highlighter = syntaxModule.Prism ?? syntaxModule.default ?? null;
      setSyntaxHighlighter(() => Highlighter);
      setSyntaxStyle(stylesModule.vscDarkPlus ?? null);
    }).catch(() => {
      // Ignore: if dynamic import fails, we just render plain code blocks.
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const codeComponents = useMemo<Pick<Components, "code">>(() => ({
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
      if (!inline && match) {
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
      const inlineCode = decodeEscapedInputText(String(children ?? ""));
      const hasMultilineInline = inlineCode.includes("\n");
      return <code
        className={`bg-bg-code border border-border px-1.5 py-0.5 text-sm font-mono text-text-primary ${hasMultilineInline ? "whitespace-pre-wrap inline-block align-top" : ""}`}
        {...props}
      >
        {inlineCode}
      </code>;
    }
  }), [SyntaxHighlighter, syntaxStyle]);
  const normalizeForRender = (raw: string) => normalizeMarkdownEscapes(raw);
  const processedContent = useMemo(() => {
    if (!content) return "";
    let processed = normalizeForRender(content);
    processed = processed.replace(/\\\(/g, "$").replace(/\\\)/g, "$").replace(/\\\[/g, "$$").replace(/\\\]/g, "$$");
    processed = processed.replace(/\\textbf\{([^}]+)\}/g, "**$1**");
    processed = processed.replace(/\\textit\{([^}]+)\}/g, "*$1*");
    processed = processed.replace(/\\emph\{([^}]+)\}/g, "*$1*");
    return processed;
  }, [content]);
  return <div className="prose prose-invert max-w-none font-mono
      prose-pre:bg-transparent prose-pre:p-0 prose-pre:my-4 prose-pre:border-0
      prose-code:bg-bg-code prose-code:px-1.5 prose-code:py-0.5 prose-code:border prose-code:border-border prose-code:text-sm prose-code:font-mono prose-code:text-text-primary
      prose-code:before:content-[''] prose-code:after:content-['']
      prose-p:leading-relaxed prose-p:text-text-primary prose-p:text-sm
      prose-headings:text-text-primary prose-headings:font-mono prose-headings:font-semibold
      prose-strong:text-text-primary prose-strong:font-semibold
      prose-ul:text-text-primary prose-ol:text-text-primary
      prose-li:text-text-primary
      prose-a:text-secondary prose-a:no-underline hover:prose-a:underline
      prose-img:rounded prose-img:border prose-img:border-border prose-img:bg-bg-surface prose-img:p-1
      prose-img:my-4 prose-img:max-w-full prose-img:cursor-zoom-in
      prose-blockquote:rounded-xl prose-blockquote:border prose-blockquote:border-border
      prose-blockquote:bg-bg-surface/60 prose-blockquote:px-4 prose-blockquote:py-3
      prose-blockquote:shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_18px_40px_rgba(0,0,0,0.35)]
      prose-blockquote:not-italic prose-blockquote:my-4
      prose-blockquote:[&>p]:text-text-primary prose-blockquote:[&>p]:text-sm
      prose-blockquote:[&>p>code]:text-text-primary
      [&_.katex]:text-text-primary [&_.katex]:!text-text-primary
      [&_.katex-display]:my-4
      [&_.katex-display]:!text-text-primary
      [&_.katex_mathit]:!text-text-primary
      [&_.katex_main]:!text-text-primary
      [&_.katex_math]:!text-text-primary
      [&_.katex]:!bg-transparent">
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={codeComponents}>
        {processedContent}
      </ReactMarkdown>
    </div>;
});
MarkdownView.displayName = "MarkdownView";