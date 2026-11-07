// App-level settings that are safe to ship in the browser.
export const APP = {
  name: "SUMAS Quiz Arena",
  // Fallbacks used until settings/app is loaded (admin can change it there).
  whatsapp: "2349155852375",
  defaultFreeCount: 10,
  // Cached full sets are discarded after this many days (offline-access limit).
  setCacheDays: 7,
  tasterCacheHours: 12,
  banksCacheMinutes: 10,
  // Receipt upload (optional). Leave cloudName empty to hide the upload field.
  // Create an UNSIGNED upload preset restricted to the sumas/ folder, image formats only.
  cloudinary: { cloudName: "ldnqgo4h", uploadPreset: "Products", folder: "sumas/receipts" },
};
