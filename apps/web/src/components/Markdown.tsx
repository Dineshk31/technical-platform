import { Children, isValidElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Highlight, themes } from 'prism-react-renderer';

// Fence tag -> Prism grammar + the label students see. Java has no bundled grammar in
// prism-react-renderer; its C-like grammar covers Java's keywords, strings and comments.
const LANGUAGES: Record<string, { prism: string; label: string }> = {
  python: { prism: 'python', label: 'Python' },
  py: { prism: 'python', label: 'Python' },
  cpp: { prism: 'cpp', label: 'C++' },
  'c++': { prism: 'cpp', label: 'C++' },
  c: { prism: 'c', label: 'C' },
  java: { prism: 'clike', label: 'Java' },
  javascript: { prism: 'javascript', label: 'JavaScript' },
  js: { prism: 'javascript', label: 'JavaScript' },
  typescript: { prism: 'typescript', label: 'TypeScript' },
  ts: { prism: 'typescript', label: 'TypeScript' },
  sql: { prism: 'sql', label: 'SQL' },
};

function CodeBlock({ language, code }: { language?: string; code: string }) {
  const lang = language ? LANGUAGES[language.toLowerCase()] : undefined;
  const label = lang?.label ?? (language && language !== 'text' ? language : 'Example');
  return (
    <figure className="md-code">
      <figcaption className="md-code-lang">{label}</figcaption>
      {lang ? (
        <Highlight theme={themes.github} code={code} language={lang.prism}>
          {({ className, style, tokens, getLineProps, getTokenProps }) => (
            <pre className={className} style={{ ...style, background: 'transparent' }}>
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  {line.map((token, j) => (
                    <span key={j} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      ) : (
        <pre>
          <code>{code}</code>
        </pre>
      )}
    </figure>
  );
}

/**
 * Safe Markdown for lesson content (Phase 18). Raw HTML is never rendered (`skipHtml`
 * drops it; react-markdown builds React elements, never innerHTML), link URLs go
 * through react-markdown's default protocol filter, and images are disallowed so a
 * lesson can't make the browser fetch arbitrary URLs. Fenced code is syntax-highlighted
 * and always labelled with its language.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        disallowedElements={['img']}
        components={{
          pre({ children: preChildren }) {
            const child = Children.toArray(preChildren)[0];
            if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) return <pre>{preChildren}</pre>;
            const match = /language-([\w+#-]+)/.exec(child.props.className ?? '');
            return <CodeBlock language={match?.[1]} code={String(child.props.children ?? '').replace(/\n$/, '')} />;
          },
          code({ className, children: codeChildren }) {
            return <code className={className ?? 'md-inline-code'}>{codeChildren}</code>;
          },
          a({ href, children: linkChildren }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {linkChildren}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
