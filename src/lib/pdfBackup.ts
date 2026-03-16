import { jsPDF } from 'jspdf';
import { Story } from '../types';
import { getPDFFileName } from './outputPaths';
import { getStoryboardPanelSourceRect, resolveStoryboardLayout } from './storyboardLayout';

interface GeneratedPdfBackup {
  blob: Blob;
  fileName: string;
}

function normalizeImageCandidate(src: string | undefined): string | null {
  if (typeof src !== 'string') return null;
  const trimmed = src.trim();
  if (!trimmed) return null;
  return trimmed;
}

function isKnownNonImageUrl(src: string): boolean {
  const normalized = src.toLowerCase();
  if (normalized.startsWith('data:image/')) return false;
  if (normalized.startsWith('blob:')) return false;

  try {
    const url = new URL(src, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    return url.pathname.toLowerCase().endsWith('.html') || url.pathname.toLowerCase().endsWith('.htm');
  } catch {
    const withoutQuery = normalized.split('?')[0]?.split('#')[0] || normalized;
    return withoutQuery.endsWith('.html') || withoutQuery.endsWith('.htm');
  }
}

function inferImageMimeType(src: string): string | null {
  const normalized = src.toLowerCase().split('?')[0]?.split('#')[0] || src.toLowerCase();
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  return null;
}

function isImageMimeType(mimeType: string | null | undefined): boolean {
  return typeof mimeType === 'string' && mimeType.toLowerCase().startsWith('image/');
}

async function createLoadableImageUrl(src: string): Promise<{ imageUrl: string; revoke: boolean }> {
  if (src.startsWith('data:image/') || src.startsWith('blob:')) {
    return { imageUrl: src, revoke: false };
  }

  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Failed to fetch source image for PDF backup (${response.status})`);
  }

  const blob = await response.blob();
  const inferredMimeType = inferImageMimeType(src);
  const normalizedBlob = isImageMimeType(blob.type)
    ? blob
    : new Blob([await blob.arrayBuffer()], { type: inferredMimeType || 'image/jpeg' });

  return {
    imageUrl: URL.createObjectURL(normalizedBlob),
    revoke: true,
  };
}

async function loadSourceImage(src: string): Promise<HTMLImageElement> {
  const { imageUrl, revoke } = await createLoadableImageUrl(src);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (revoke) {
        URL.revokeObjectURL(imageUrl);
      }
      resolve(img);
    };
    img.onerror = () => {
      if (revoke) {
        URL.revokeObjectURL(imageUrl);
      }
      reject(new Error('Failed to load source image for PDF backup'));
    };
    img.src = imageUrl;
  });
}

async function loadBestAvailableImage(candidates: Array<string | undefined>): Promise<HTMLImageElement> {
  const normalizedCandidates = [...new Set(candidates.map(normalizeImageCandidate).filter(Boolean) as string[])]
    .filter((candidate) => !isKnownNonImageUrl(candidate));

  if (!normalizedCandidates.length) {
    throw new Error('Missing usable image URL for PDF backup generation');
  }

  let lastError: unknown = null;

  for (const candidate of normalizedCandidates) {
    try {
      return await loadSourceImage(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to load any usable image for PDF backup');
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const words = normalized.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
      continue;
    }
    if (currentLine) lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

function drawTextPage(
  ctx: CanvasRenderingContext2D,
  pageSize: number,
  text: string,
  pageNumber: number
): void {
  const marginX = 110;
  const marginY = 90;
  const maxTextWidth = pageSize - marginX * 2;
  const fontSize = 52;
  const lineHeight = 84;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, pageSize, pageSize);

  ctx.fillStyle = '#1F2937';
  ctx.font = `500 ${fontSize}px "Arial", "Helvetica Neue", sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';

  const lines = wrapText(ctx, text, maxTextWidth);
  const contentHeight = lines.length * lineHeight;
  let y = Math.max(pageSize / 2 - contentHeight / 2 + lineHeight / 2, marginY + lineHeight / 2);

  for (const line of lines) {
    ctx.fillText(line, pageSize - marginX, y);
    y += lineHeight;
  }

  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.font = 'bold 32px "Arial", sans-serif';
  ctx.fillStyle = '#1F2937';
  ctx.fillText(String(pageNumber), 48, pageSize - 52);
}

export async function createPdfBackupBlob(story: Story): Promise<GeneratedPdfBackup> {
  const compositeImage = await loadBestAvailableImage([
    story.source_image_url,
    story.display_image_url,
    story.composite_image_url,
  ]);
  const segments = Array.isArray(story.segments) ? story.segments : [];
  const storyboardLayout = resolveStoryboardLayout(segments.length);

  const pageSize = 1200;
  const spreadWidth = pageSize * 2;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not initialize canvas for PDF backup');
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [200, 200],
    compress: true,
  });

  // Cover page (panel 0)
  canvas.width = pageSize;
  canvas.height = pageSize;
  const coverRect = getStoryboardPanelSourceRect(
    compositeImage.width,
    compositeImage.height,
    0,
    storyboardLayout
  );
  ctx.drawImage(compositeImage, coverRect.sx, coverRect.sy, coverRect.size, coverRect.size, 0, 0, pageSize, pageSize);
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 200, 200);

  // Story spreads
  for (let i = 0; i < storyboardLayout.storyPanelCount; i++) {
    const panelIndex = i + storyboardLayout.storyPanelOffset;
    const panelRect = getStoryboardPanelSourceRect(
      compositeImage.width,
      compositeImage.height,
      panelIndex,
      storyboardLayout
    );

    pdf.addPage([400, 200], 'landscape');

    canvas.width = spreadWidth;
    canvas.height = pageSize;

    drawTextPage(ctx, pageSize, segments[i] || '', i + 2);
    ctx.drawImage(
      compositeImage,
      panelRect.sx,
      panelRect.sy,
      panelRect.size,
      panelRect.size,
      pageSize,
      0,
      pageSize,
      pageSize
    );

    pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 400, 200);
  }

  // Back cover
  pdf.addPage([200, 200], 'portrait');
  canvas.width = pageSize;
  canvas.height = pageSize;
  ctx.fillStyle = '#FFC72C';
  ctx.fillRect(0, 0, pageSize, pageSize);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 88px "Arial", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.fillText('הסוף!', pageSize / 2, pageSize / 2);
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 200, 200);

  return {
    blob: pdf.output('blob') as Blob,
    fileName: getPDFFileName(story.title || 'סיפור_קסום'),
  };
}
