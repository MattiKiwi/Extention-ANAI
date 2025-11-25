import { saveSettingsDebounced } from '../../../../script.js';
import { debounce } from '../../../utils.js';
import { extension_settings, renderExtensionTemplateAsync } from '../../../extensions.js';

const EXTENSION_NAME = 'third-party/advanced-image-gen';
const SETTINGS_KEY = 'advanced_nai_image';
const ROOT_ID = 'ani_container';

const defaultSettings = {
  prompt: '',
  scene: '',
  character: '',
  user: '',
};

function ensureSettings() {
  if (!extension_settings[SETTINGS_KEY]) {
    extension_settings[SETTINGS_KEY] = { ...defaultSettings };
    return;
  }

  for (const [key, value] of Object.entries(defaultSettings)) {
    if (!(key in extension_settings[SETTINGS_KEY])) {
      extension_settings[SETTINGS_KEY][key] = value;
    }
  }
}

function populateUI(root) {
  const settings = extension_settings[SETTINGS_KEY];
  $(root)
    .find('#ani-prompt')
    .val(settings.prompt ?? '');
  $(root)
    .find('#ani-scene')
    .val(settings.scene ?? '');
  $(root)
    .find('#ani-char')
    .val(settings.character ?? '');
  $(root)
    .find('#ani-user')
    .val(settings.user ?? '');
}

function bindField(root, selector, key) {
  $(root)
    .find(selector)
    .on(
      'input',
      debounce((event) => {
        extension_settings[SETTINGS_KEY][key] = event.target.value;
        saveSettingsDebounced();
      }, 250),
    );
}

function bindButtons(root) {
  $(root)
    .find('#ani-generate-desc')
    .on('click', () => {
      const prompt = extension_settings[SETTINGS_KEY].prompt || '';
      console.log('[Advanced NAI Image] Generate Description', { prompt });
    });

  $(root)
    .find('#ani-generate-image')
    .on('click', () => {
      const settings = extension_settings[SETTINGS_KEY];
      console.log('[Advanced NAI Image] Generate Image', {
        scene: settings.scene,
        character: settings.character,
        user: settings.user,
      });
    });
}

function removeExistingUI() {
  document.getElementById(ROOT_ID)?.remove();
}

async function mountUI() {
  const container =
    document.getElementById('extensions_settings2') ??
    document.getElementById('extensions_settings');

  if (!container) {
    console.warn('[Advanced NAI Image] Could not find settings panel to mount UI.');
    return;
  }

  removeExistingUI();
  const html = await renderExtensionTemplateAsync(EXTENSION_NAME, 'dropdown');
  container.insertAdjacentHTML('beforeend', html);

  const root = document.getElementById(ROOT_ID);
  if (!root) {
    console.error('[Advanced NAI Image] Failed to render UI template.');
    return;
  }

  populateUI(root);
  bindField(root, '#ani-prompt', 'prompt');
  bindField(root, '#ani-scene', 'scene');
  bindField(root, '#ani-char', 'character');
  bindField(root, '#ani-user', 'user');
  bindButtons(root);
}

jQuery(async () => {
  ensureSettings();
  await mountUI();
});
