import { fromMarkdown } from 'mdast-util-from-markdown';

interface MarkdownNode {
  alt?: unknown;
  children?: MarkdownNode[];
  type: string;
  value?: unknown;
}

const COUNTED_VALUE_NODES = new Set(['code', 'inlineCode', 'text']);
const HAN_CHARACTER_PATTERN = /\p{Script=Han}/gu;
const NON_HAN_WORD_PATTERN =
  /[\p{L}\p{N}]+(?:['’\-‐‑‒–—][\p{L}\p{N}]+)*/gu;

const readableMarkdownText = (markdown: string): string => {
  const chunks: string[] = [];
  const visit = (node: MarkdownNode) => {
    if (COUNTED_VALUE_NODES.has(node.type) && typeof node.value === 'string') {
      chunks.push(node.value);
    } else if (node.type === 'image' && typeof node.alt === 'string') {
      chunks.push(node.alt);
    }

    node.children?.forEach(visit);
  };

  visit(fromMarkdown(markdown) as unknown as MarkdownNode);
  return chunks.join(' ');
};

/**
 * Counts reader-visible prose units: each Han character counts as one, while
 * each non-Han word or number counts as one. Markdown syntax and link targets
 * are excluded by reading text-bearing nodes from the parsed Markdown tree.
 */
export const countManuscriptWords = (markdown: string): number => {
  const readableText = readableMarkdownText(markdown);
  const hanCount = readableText.match(HAN_CHARACTER_PATTERN)?.length ?? 0;
  const textWithoutHan = readableText.replace(HAN_CHARACTER_PATTERN, ' ');
  const nonHanWordCount = textWithoutHan.match(NON_HAN_WORD_PATTERN)?.length ?? 0;

  return hanCount + nonHanWordCount;
};
