// Client-side image compression and Cloudinary upload (unsigned preset).
import { APP } from "./config.js";

export const fmtBytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(2)} MB`);
export const cloudinaryReady = () => !!(APP.cloudinary.cloudName && APP.cloudinary.uploadPreset);

const toBlob = (canvas, type, q) => new Promise((res) => canvas.toBlob(res, type, q));

/**
 * Shrink to maxSide pixels and re-encode (WebP, or JPEG where WebP isn't supported).
 * Keeps the original if re-encoding would not make it smaller.
 * Returns { blob, name, original, size, savedPct, w, h, kept }.
 */
export async function compressImage(file, { maxSide = 1200, quality = 0.8 } = {}) {
  const base = file.name.replace(/\.[^.]+$/, "") || "image";
  const keep = (w = 0, h = 0) => ({ blob: file, name: file.name, original: file.size, size: file.size, savedPct: 0, w, h, kept: true });
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { return keep(); }
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  let blob = await toBlob(canvas, "image/webp", quality);
  if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", quality);
  if (!blob || (blob.size >= file.size && scale === 1)) return keep(w, h);
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  return { blob, name: `${base}.${ext}`, original: file.size, size: blob.size, savedPct: Math.max(0, Math.round((1 - blob.size / file.size) * 100)), w, h, kept: false };
}

/** Upload a blob to Cloudinary. Returns { url, bytes }. */
export async function uploadToCloudinary(blob, name, folder = APP.cloudinary.folder) {
  const c = APP.cloudinary;
  const fd = new FormData();
  fd.append("file", blob, name); fd.append("upload_preset", c.uploadPreset); if (folder) fd.append("folder", folder);
  const r = await fetch(`https://api.cloudinary.com/v1_1/${c.cloudName}/image/upload`, { method: "POST", body: fd });
  if (!r.ok) throw Object.assign(new Error("upload"), { code: "upload-failed" });
  const j = await r.json();
  return { url: j.secure_url, bytes: j.bytes || blob.size };
}
