import { ensureSettings } from './settings.js';
import { mountUI } from './ui.js';

jQuery(async () => {
  ensureSettings();
  await mountUI();
});
