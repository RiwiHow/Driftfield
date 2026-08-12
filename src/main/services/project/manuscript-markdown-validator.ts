import { fromMarkdown } from 'mdast-util-from-markdown';

export const MAX_MANUSCRIPT_MARKDOWN_BYTES = 512 * 1024;

export type ManuscriptMarkdownValidationCode =
  | 'empty'
  | 'forbidden-control-character'
  | 'parse-failed'
  | 'protocol-markup'
  | 'raw-html'
  | 'severely-under-target'
  | 'too-large';

export type ManuscriptMarkdownValidationResult =
  | { ok: true }
  | { code: ManuscriptMarkdownValidationCode; ok: false };

interface ValidationOptions {
  maxBytes?: number;
  targetLength?: number | null;
}

const containsHtmlNode = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false;
  const node = value as { children?: unknown[]; type?: unknown };
  if (node.type === 'html') return true;
  return Array.isArray(node.children) && node.children.some(containsHtmlNode);
};

const visibleLength = (markdown: string): number =>
  Array.from(markdown.replace(/\s/gu, '')).length;

export const validateManuscriptMarkdown = (
  markdown: string,
  options: ValidationOptions = {},
): ManuscriptMarkdownValidationResult => {
  if (markdown.trim().length === 0) return { code: 'empty', ok: false };
  if (
    Buffer.byteLength(markdown, 'utf8') >
    (options.maxBytes ?? MAX_MANUSCRIPT_MARKDOWN_BYTES)
  ) {
    return { code: 'too-large', ok: false };
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(markdown)) {
    return { code: 'forbidden-control-character', ok: false };
  }
  if (
    /<\/?(?:prompt|tool|tool_call|tool_result|assistant|system|developer)(?:\s|>|\/)/iu
      .test(markdown)
  ) {
    return { code: 'protocol-markup', ok: false };
  }
  let tree;
  try {
    tree = fromMarkdown(markdown);
  } catch {
    return { code: 'parse-failed', ok: false };
  }
  if (containsHtmlNode(tree)) return { code: 'raw-html', ok: false };
  if (
    options.targetLength !== null &&
    options.targetLength !== undefined &&
    options.targetLength > 0 &&
    visibleLength(markdown) < Math.ceil(options.targetLength * 0.35)
  ) {
    return { code: 'severely-under-target', ok: false };
  }
  return { ok: true };
};

export const assertValidManuscriptMarkdown = (
  markdown: string,
  options: ValidationOptions = {},
): void => {
  const result = validateManuscriptMarkdown(markdown, options);
  if (!result.ok) {
    throw new Error(`Invalid Manuscript Markdown: ${result.code}`);
  }
};
