export function stringifyPrompt(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

export function formatTagList(...parts) {
  const combined = parts
    .map((part) => stringifyPrompt(part).replace(/\r/g, ''))
    .filter((part) => part && part.trim().length)
    .join(', ');
  return combined
    .split(/[,.;\n]+/)
    .map((segment) => segment.trim().replace(/\s+/g, ' ').toLowerCase())
    .filter(Boolean)
    .join(', ');
}

export function normalizeText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}
