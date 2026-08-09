export const WORKSPACE_PANEL_MIN_WIDTHS = {
  library: 220,
  editor: 430,
  assistant: 270,
} as const;

export const WORKSPACE_PANEL_SEPARATOR_WIDTH = 1;

export const WORKSPACE_MIN_CONTENT_WIDTH =
  Object.values(WORKSPACE_PANEL_MIN_WIDTHS).reduce(
    (total, width) => total + width,
    0,
  ) +
  WORKSPACE_PANEL_SEPARATOR_WIDTH * 2;
