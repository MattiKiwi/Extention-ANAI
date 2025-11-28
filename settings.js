import { saveSettingsDebounced as coreSaveSettings } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { SETTINGS_KEY } from './config.js';

export const defaultSettings = {
  prompt: `
    Generate only lowercase comma-separated visual tags.
    No sentences, no narration, no dialogue, no quotes, no conjunctions, no filler words.

    Include tags for:
    - number of characters
    - gender and appearance
    - clothing
    - expression
    - pose
    - camera angle and composition
    - environment and mood

    Use short tags only, similar to: 1girl, black hair, grey eyes, head tilt, looking at viewer, close-up, from above.
    `.trim(),
  scene: '',
  character: '',
  user: '',
};

export function ensureSettings() {
  if (!extension_settings[SETTINGS_KEY]) {
    extension_settings[SETTINGS_KEY] = { ...defaultSettings };
    return;
  }

  const settings = extension_settings[SETTINGS_KEY];
  for (const [key, value] of Object.entries(defaultSettings)) {
    if (!(key in settings)) {
      settings[key] = value;
    }
  }
}

export function getSettings() {
  ensureSettings();
  return extension_settings[SETTINGS_KEY];
}

export const saveSettingsDebounced = coreSaveSettings;
