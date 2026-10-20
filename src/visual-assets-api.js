// Client of the private visual assets (images of the Resumo Mestre): upload, metadata, edit of the texts, and the cached loader the renderer uses.
import { apiRequest, apiUpload } from "./api-client.js";

const apiBase = () => (typeof window !== "undefined" && window.__SMARTLEARN_API_BASE__) || "";
export const newOperationKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** URL of the image bytes: owner-only and cookie-authenticated, exactly like the original-PDF link. */
export const assetFileUrl = (id) => `${apiBase()}/v1/visual-assets/${id}/file`;

const toRecord = (asset) => ({ ...asset, url: assetFileUrl(asset.id) });

// One request per figure per page load, shared by every place that draws it; failures are not cached, so a later render can retry.
const cache = new Map();
export function loadFigureRecord(id) {
  if (!cache.has(id)) {
    cache.set(id, apiRequest(`/v1/visual-assets/${id}`).then(({ asset }) => toRecord(asset), (err) => { cache.delete(id); throw err; }));
  }
  return cache.get(id);
}
export const forgetFigure = (id) => cache.delete(id);

/**
 * Stores an image (a File/Blob). `crop` = {sourceId, pageIndex, x, y, w, h, rotation} turns it into a record of a PDF region.
 * `operationKey` makes a repeated delivery of the same operation return the same asset.
 */
export async function uploadAsset(blob, { alt, caption = "", description = "", crop = null, operationKey = newOperationKey() }) {
  const query = new URLSearchParams({ operationKey, alt });
  if (caption) query.set("caption", caption);
  if (description) query.set("description", description);
  if (crop) {
    query.set("kind", "PDF_CROP");
    for (const [key, value] of Object.entries(crop)) query.set(key, String(value));
  }
  const form = new FormData();
  form.append("file", blob, blob.name || "imagem.png");
  const { asset } = await apiUpload(`/v1/visual-assets?${query}`, form);
  const record = toRecord(asset);
  cache.set(asset.id, Promise.resolve(record));
  return record;
}

export async function updateAssetTexts(id, patch) {
  const { asset } = await apiRequest(`/v1/visual-assets/${id}`, { method: "PATCH", body: patch });
  const record = toRecord(asset);
  cache.set(id, Promise.resolve(record));
  return record;
}
