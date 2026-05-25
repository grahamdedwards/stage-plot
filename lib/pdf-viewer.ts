import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Chart } from './types';
import { getCachedChartUrl } from './chart-cache';

// Lazy-init pdf.js to avoid SSR issues
let pdfjsLib: typeof import('pdfjs-dist') | null = null;

async function getPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  return pdfjsLib;
}

// ─── In-memory PDF document cache ─────────────────────────────────────────
// Keyed by fileId:modifiedTime to match offline cache versioning.
// Max 5 docs in memory — evicts furthest from current index.

interface CachedDoc {
  doc: PDFDocumentProxy;
  key: string;
  lastAccess: number;
}

const docCache = new Map<string, CachedDoc>();
const MAX_CACHED_DOCS = 5;

function cacheKey(chart: Chart): string {
  return `${chart.fileId}:${chart.modifiedTime ?? ''}`;
}

function evictIfNeeded() {
  if (docCache.size <= MAX_CACHED_DOCS) return;
  // Evict least recently accessed
  let oldest: string | null = null;
  let oldestTime = Infinity;
  for (const [key, entry] of docCache) {
    if (entry.lastAccess < oldestTime) {
      oldestTime = entry.lastAccess;
      oldest = key;
    }
  }
  if (oldest) {
    const entry = docCache.get(oldest);
    entry?.doc.destroy();
    docCache.delete(oldest);
  }
}

export async function loadPdfDoc(chart: Chart, accessToken?: string): Promise<PDFDocumentProxy | null> {
  if (!chart.fileId) return null;

  const key = cacheKey(chart);
  const cached = docCache.get(key);
  if (cached) {
    cached.lastAccess = Date.now();
    return cached.doc;
  }

  // Try offline cache first
  let blobUrl = await getCachedChartUrl(chart);

  // Fall back to network fetch
  if (!blobUrl && accessToken) {
    try {
      const res = await fetch('/api/drive/download', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileId: chart.fileId, mimeType: chart.mimeType }),
      });
      if (res.ok) {
        const blob = await res.blob();
        blobUrl = URL.createObjectURL(blob);
      }
    } catch {
      return null;
    }
  }

  if (!blobUrl) return null;

  try {
    const pdfjs = await getPdfjs();
    const loadingTask = pdfjs.getDocument(blobUrl);
    const doc = await loadingTask.promise;

    evictIfNeeded();
    docCache.set(key, { doc, key, lastAccess: Date.now() });

    return doc;
  } catch {
    return null;
  }
}

export async function renderPage(
  doc: PDFDocumentProxy,
  pageNum: number,
  canvas: HTMLCanvasElement,
): Promise<void> {
  if (pageNum < 1 || pageNum > doc.numPages) return;

  const page = await doc.getPage(pageNum);
  const dpr = window.devicePixelRatio || 1;

  // Scale to fit canvas container width
  const container = canvas.parentElement;
  if (!container) return;
  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;

  const viewport = page.getViewport({ scale: 1 });
  const scaleW = containerWidth / viewport.width;
  const scaleH = containerHeight / viewport.height;
  const scale = Math.min(scaleW, scaleH) * dpr;

  const scaledViewport = page.getViewport({ scale });

  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;
  canvas.style.width = `${scaledViewport.width / dpr}px`;
  canvas.style.height = `${scaledViewport.height / dpr}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  await page.render({ canvas, viewport: scaledViewport }).promise;
}

export function destroyAllDocs() {
  for (const entry of docCache.values()) {
    entry.doc.destroy();
  }
  docCache.clear();
}

export function prefetchChart(chart: Chart, accessToken?: string) {
  // Fire and forget — just load into cache
  loadPdfDoc(chart, accessToken).catch(() => {});
}
