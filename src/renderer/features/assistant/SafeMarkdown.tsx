import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface SafeMarkdownProps {
  children: string;
}

const ALLOWED_ELEMENTS = [
  'a',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'img',
  'input',
  'li',
  'ol',
  'p',
  'pre',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
] as const;

const DisabledLink = ({ children }: { children?: ReactNode }) => (
  <span className="agent-markdown-link">{children}</span>
);

const OmittedImage = ({ alt }: { alt?: string }) => (
  <span className="agent-markdown-image">
    {alt ?? ''}
  </span>
);

export function SafeMarkdown({ children }: SafeMarkdownProps) {
  return (
    <Markdown
      allowedElements={[...ALLOWED_ELEMENTS]}
      components={{
        a: DisabledLink,
        img: OmittedImage,
      }}
      remarkPlugins={[remarkGfm]}
      skipHtml
    >
      {children}
    </Markdown>
  );
}
