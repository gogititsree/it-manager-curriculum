/**
 * Markdown prose. Typography lives in the `.prose-ink` rules in index.css rather than in a per-tag
 * component map, so mobile can reimplement the same block model without inheriting web styling.
 *
 * Two overrides earn their place: fenced code inside prose goes through the same CodeBlock as a
 * `code` block, and links to other sites open in a new tab and say so.
 */
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { CodeBlock } from './CodeBlock';

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

const components: Components = {
  pre({ children }) {
    const first = Children.toArray(children)[0];
    if (isValidElement<{ className?: string; children?: ReactNode }>(first)) {
      const el = first as ReactElement<{ className?: string; children?: ReactNode }>;
      const lang = /language-([\w-]+)/.exec(el.props.className ?? '')?.[1];
      return <CodeBlock code={textOf(el.props.children).replace(/\n$/, '')} lang={lang} />;
    }
    return <CodeBlock code={textOf(children)} />;
  },
  a({ href, children }) {
    const external = !!href && /^https?:/i.test(href);
    return (
      <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}>
        {children}
        {external ? <span className="sr-only"> (opens in a new tab)</span> : null}
      </a>
    );
  },
};

export function Markdown({ md, className = '' }: { md: string; className?: string }) {
  return (
    <div className={`prose-ink ${className}`}>
      <ReactMarkdown components={components}>{md}</ReactMarkdown>
    </div>
  );
}
