// Centralized rules for what files an order may carry. Lives in its own
// module so the upload route + UI both pull from the same allow-list.

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_ATTACHMENTS_PER_ORDER = 20;

// Conservative mime allow-list — documents and images only. Refusing the
// rest blocks the obvious upload vectors (executables, scripts, archives).
export const ALLOWED_MIME_TYPES: ReadonlyArray<string> = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/heic",
  "image/heif",
  "image/webp",
  "text/plain",
];

export function isAllowedMime(t: string | null | undefined): boolean {
  if (!t) return false;
  return ALLOWED_MIME_TYPES.includes(t.toLowerCase().split(";")[0].trim());
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// Filename sanitization for the on-DB row + the Content-Disposition header.
// Stripping path separators stops "../" tricks; trimming length keeps the
// DB column reasonable.
export function safeFilename(raw: string): string {
  return raw.replace(/[\\/:]/g, "_").replace(/\s+/g, " ").trim().slice(0, 200) || "file";
}
