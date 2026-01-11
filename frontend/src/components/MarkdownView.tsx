import React, { useMemo, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";
const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];
const syntaxHighlighterStyle = vscDarkPlus;
interface MarkdownViewProps {
  content: string;
}
export const MarkdownView: React.FC<MarkdownViewProps> = memo(({
  content
}) => {
  const codeComponents = useMemo(() => ({
    code({
      node,
      inline,
      className,
      children,
      ...props
    }: any) {
      const match = /language-(\w+)/.exec(className || "");
      const language = match ? match[1] : "";
      if (!inline && match) {
        return <div className="my-4 overflow-hidden border border-border">
              <SyntaxHighlighter language={language} style={syntaxHighlighterStyle} customStyle={{
            margin: 0,
            padding: "1rem",
            fontSize: "0.875rem",
            lineHeight: "1.5",
            background: "var(--bg-code)"
          }} PreTag="div" {...props}>
                {String(children).replace(/\n$/, "")}
              </SyntaxHighlighter>
            </div>;
      }
      return <code className="bg-bg-code border border-border px-1.5 py-0.5 text-sm font-mono text-text-primary" {...props}>
            {children}
          </code>;
    }
  }), []);
  const normalizeForRender = (raw: string) => {
    let s = String(raw ?? "");
    s = s.replace(/\r\n/g, "\n");
    const escapedNewlinesCount = (s.match(/\\n/g) || []).length;
    if (!s.includes("\n") && escapedNewlinesCount >= 2 || escapedNewlinesCount >= 6) {
      s = s.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
    }
    s = s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
    return s;
  };
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