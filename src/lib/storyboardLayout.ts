export interface StoryboardLayout {
  mode: 'legacy16' | 'compact12';
  columns: number;
  rows: number;
  coverPanelCount: number;
  storyPanelCount: number;
  totalPanelCount: number;
  storyPanelOffset: number;
}

const LEGACY_16_LAYOUT: StoryboardLayout = {
  mode: 'legacy16',
  columns: 4,
  rows: 4,
  coverPanelCount: 2,
  storyPanelCount: 14,
  totalPanelCount: 16,
  storyPanelOffset: 2,
};

const COMPACT_12_LAYOUT: StoryboardLayout = {
  mode: 'compact12',
  columns: 4,
  rows: 3,
  coverPanelCount: 2,
  storyPanelCount: 10,
  totalPanelCount: 12,
  storyPanelOffset: 2,
};

export function resolveStoryboardLayout(segmentCount?: number): StoryboardLayout {
  const safeCount = Number.isFinite(Number(segmentCount)) ? Number(segmentCount) : 0;
  if (safeCount > COMPACT_12_LAYOUT.storyPanelCount) {
    return LEGACY_16_LAYOUT;
  }
  return COMPACT_12_LAYOUT;
}

export function getStoryboardBackgroundSize(layout: StoryboardLayout): string {
  return `${layout.columns * 100}% ${layout.rows * 100}%`;
}

export function getStoryboardBackgroundPosition(panelIndex: number, layout: StoryboardLayout): string {
  const safeIndex = Math.max(0, Math.min(layout.totalPanelCount - 1, Math.floor(panelIndex)));
  const col = safeIndex % layout.columns;
  const row = Math.floor(safeIndex / layout.columns);
  const posX = layout.columns > 1 ? (col * 100) / (layout.columns - 1) : 0;
  const posY = layout.rows > 1 ? (row * 100) / (layout.rows - 1) : 0;
  return `${posX}% ${posY}%`;
}

export interface StoryboardPanelSourceRect {
  sx: number;
  sy: number;
  size: number;
  row: number;
  col: number;
}

export function getStoryboardPanelSourceRect(
  imageWidth: number,
  imageHeight: number,
  panelIndex: number,
  layout: StoryboardLayout
): StoryboardPanelSourceRect {
  const safeWidth = Math.max(1, Number(imageWidth) || 1);
  const safeHeight = Math.max(1, Number(imageHeight) || 1);
  const safeIndex = Math.max(0, Math.min(layout.totalPanelCount - 1, Math.floor(panelIndex)));
  const row = Math.floor(safeIndex / layout.columns);
  const col = safeIndex % layout.columns;

  // Keep each panel square even when the source image is slightly off ratio.
  const rawCellWidth = safeWidth / layout.columns;
  const rawCellHeight = safeHeight / layout.rows;
  const panelSize = Math.min(rawCellWidth, rawCellHeight);
  const gridWidth = panelSize * layout.columns;
  const gridHeight = panelSize * layout.rows;
  const offsetX = Math.max(0, (safeWidth - gridWidth) / 2);
  const offsetY = Math.max(0, (safeHeight - gridHeight) / 2);

  return {
    sx: offsetX + col * panelSize,
    sy: offsetY + row * panelSize,
    size: panelSize,
    row,
    col,
  };
}
