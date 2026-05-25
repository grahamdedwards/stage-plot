import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
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
// Max 5 docs in memory — evicts least recently accessed.

interface CachedDoc {
  doc: PDFDocumentProxy;
  blobUrl: string | null; // non-null if we created a blob URL (network path)
  lastAccess: number;
}

const docCache = new Map<string, CachedDoc>();
const MAX_CACHED_DOCS = 5;

function cacheKey(chart: Chart): string {
  return `${chart.fileId}:${chart.modifiedTime ?? ''}`;
}

function evictOldest() {
  if (docCache.size < MAX_CACHED_DOCS) return;
  let oldest: string | null = null;
  let oldestTime = Infinity;
  for (const [key, entry] of docCache) {
    if (entry.lastAccess < oldestTime) {
      oldestTime = entry.lastAccess;
      oldest = key;
    }
  }
  if (oldest) {
    const entry = docCache.get(oldest)!;
    entry.doc.destroy();
    if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl);
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
  let ownsBlobUrl = false;

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
        ownsBlobUrl = true;
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

    evictOldest();
    docCache.set(key, {
      doc,
      blobUrl: ownsBlobUrl ? blobUrl : null,
      lastAccess: Date.now(),
    });

    return doc;
  } catch {
    if (ownsBlobUrl) URL.revokeObjectURL(blobUrl);
    return null;
  }
}

// ─── Render serialization ─────────────────────────────────────────────────
// Only one render per canvas at a time. Cancel previous if a new one starts.

let activeRenderTask: RenderTask | null = null;

export async function renderPage(
  doc: PDFDocumentProxy,
  pageNum: number,
  canvas: HTMLCanvasElement,
): Promise<void> {
  if (pageNum < 1 || pageNum > doc.numPages) return;

  // Cancel any in-flight render on this canvas
  if (activeRenderTask) {
    activeRenderTask.cancel();
    activeRenderTask = null;
  }

  const page = await doc.getPage(pageNum);
  const dpr = window.devicePixelRatio || 1;

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

  const task = page.render({ canvas, viewport: scaledViewport });
  activeRenderTask = task;

  try {
    await task.promise;
  } catch {
    // Render was cancelled — expected during fast navigation
  } finally {
    if (activeRenderTask === task) activeRenderTask = null;
  }
}

export function destroyAllDocs() {
  if (activeRenderTask) {
    activeRenderTask.cancel();
    activeRenderTask = null;
  }
  for (const entry of docCache.values()) {
    entry.doc.destroy();
    if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl);
  }
  docCache.clear();
}

export function prefetchChart(chart: Chart, accessToken?: string) {
  loadPdfDoc(chart, accessToken).catch(() => {});
}
