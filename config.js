export const FALLBACK_EXTENSION_PATH = 'third-party/advanced-image-gen';
export const SETTINGS_KEY = 'advanced_nai_image';
export const ROOT_ID = 'ani_container';
export const LOG_PREFIX = '[Advanced NAI Image]';

export function deriveExtensionPath() {
  try {
    const url = new URL(import.meta.url);
    const [, afterExtensions = ''] = url.pathname.split('/extensions/');
    const [extensionPath] = afterExtensions.split('/config.js');
    return extensionPath || FALLBACK_EXTENSION_PATH;
  } catch (error) {
    console.warn(`${LOG_PREFIX} Unable to derive extension path, falling back.`, error);
    return FALLBACK_EXTENSION_PATH;
  }
}

export const extensionPath = deriveExtensionPath();
console.log(`${LOG_PREFIX} Extension path: ${extensionPath}`);
