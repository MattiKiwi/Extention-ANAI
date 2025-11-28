import { saveSettingsDebounced as coreSaveSettings } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { SETTINGS_KEY } from './config.js';

export const defaultSettings = {
  prompt: `Generate a concise tag-style prompt describing the current scene. Output only comma-separated tags.
Include the number of characters, their attributes (gender, appearance, clothing, pose, expression), and key scene descriptors (camera angle, composition, environment, mood).
Be specific but concise, using tags similar to: ‘1girl, black hair, grey eyes, head tilt, looking at viewer, close-up, from above’.
Do NOT include full sentences—only descriptive tags.`,
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
