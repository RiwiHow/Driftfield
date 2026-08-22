import {
  PROJECT_ICON_IDS,
  type ProjectIconId,
} from '../../shared/contracts/project-layout';

export const MAX_PROJECT_ICON_SUGGESTIONS = 12;

const IGNORED_QUERY_WORDS = new Set([
  'and',
  'category',
  'folder',
  'for',
  'icon',
  'icons',
  'lore',
  'or',
  'the',
]);

const queryTokens = (query: string): string[] => [
  ...new Set(
    query.toLowerCase().match(/[a-z0-9]+/gu)
      ?.filter((token) => !IGNORED_QUERY_WORDS.has(token)) ?? [],
  ),
].slice(0, 8);

const scoreIcon = (
  icon: ProjectIconId,
  normalizedQuery: string,
  tokens: string[],
): number => {
  const iconTokens = icon.split('-');
  let score = icon === normalizedQuery
    ? 2_000
    : icon.startsWith(`${normalizedQuery}-`)
      ? 800
      : 0;
  for (const token of tokens) {
    if (iconTokens.includes(token)) {
      score += 240;
    } else if (iconTokens.some((iconToken) => iconToken.startsWith(token))) {
      score += 120;
    } else if (
      token.length >= 3 &&
      iconTokens.some((iconToken) => iconToken.includes(token))
    ) {
      score += 60;
    }
  }
  if (score > 0) score += Math.max(0, 40 - icon.length);
  return score;
};

export const searchProjectIcons = (query: string): ProjectIconId[] => {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  const normalizedQuery = tokens.join('-');
  return PROJECT_ICON_IDS
    .map((icon) => ({ icon, score: scoreIcon(icon, normalizedQuery, tokens) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) =>
      right.score - left.score ||
      left.icon.length - right.icon.length ||
      left.icon.localeCompare(right.icon))
    .slice(0, MAX_PROJECT_ICON_SUGGESTIONS)
    .map(({ icon }) => icon);
};
