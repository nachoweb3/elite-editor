import path from 'node:path';

const MAX_NAME_LENGTH = 120;
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const FALLBACK_NAME = 'elite-editor';

export function artifactDownloadName(project, type, extension) {
  const label = {export: 'final', preview: 'preview', thumbnail: 'portada', editor: 'proyecto'}[type] || type || 'resultado';
  const suffix = `-${label}${extension}`;
  const base = String(project.name || FALLBACK_NAME)
    .replace(/\.(mp4|mov|mkv|webm|m4v)$/i, '')
    .replace(INVALID_FILENAME_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH - suffix.length)
    .toWellFormed()
    .trimEnd();
  return `${base || FALLBACK_NAME}${suffix}`;
}

export function attachmentHeader(value) {
  const clean = String(value || `${FALLBACK_NAME}.mp4`)
    .replace(/[\r\n"\\]/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .toWellFormed() || `${FALLBACK_NAME}.mp4`;
  const extension = path.extname(clean);
  const ascii = name => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._ -]+/g, ' ').trim().replace(/[\s-]+/g, '-');
  const safeExtension = ascii(extension);
  const stem = ascii(extension ? clean.slice(0, -extension.length) : clean);
  const fallback = `${stem.slice(0, 90 - safeExtension.length) || FALLBACK_NAME}${safeExtension}`;
  const encoded = encodeURIComponent(clean).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
