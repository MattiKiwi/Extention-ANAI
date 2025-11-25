import { saveSettingsDebounced } from '../../../../script.js';
import { debounce } from '../../../utils.js';
import { extension_settings, getContext, renderExtensionTemplateAsync } from '../../../extensions.js';

const FALLBACK_EXTENSION_PATH = 'third-party/advanced-image-gen';
const SETTINGS_KEY = 'advanced_nai_image';
const ROOT_ID = 'ani_container';
const LOG_PREFIX = '[Advanced NAI Image]';

function deriveExtensionPath() {
  try {
    const url = new URL(import.meta.url);
    const [, afterExtensions = ''] = url.pathname.split('/extensions/');
    const [extensionPath] = afterExtensions.split('/index.js');
    return extensionPath || FALLBACK_EXTENSION_PATH;
  } catch (error) {
    console.warn(`${LOG_PREFIX} Unable to derive extension path, falling back.`, error);
    return FALLBACK_EXTENSION_PATH;
  }
}

const extensionPath = deriveExtensionPath();

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
      const snapshot = captureContextSnapshot();
      console.group(`${LOG_PREFIX} Generate Description`);
      console.log('Prompt field:', prompt);
      console.log('Recent messages:', snapshot.messages);
      console.log('User description:', snapshot.userDescription);
      console.log('Character description:', snapshot.characterDescription);
      console.groupEnd();
    });

  $(root)
    .find('#ani-generate-image')
    .on('click', () => {
      const settings = extension_settings[SETTINGS_KEY];
      console.log(`${LOG_PREFIX} Generate Image`, {
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
    console.warn(`${LOG_PREFIX} Could not find settings panel to mount UI.`);
    return;
  }

  removeExistingUI();
  let html;
  try {
    html = await renderExtensionTemplateAsync(extensionPath, 'dropdown');
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to load dropdown template.`, error);
    return;
  }

  container.insertAdjacentHTML('beforeend', html);

  const root = document.getElementById(ROOT_ID);
  if (!root) {
    console.error(`${LOG_PREFIX} Failed to render UI template.`);
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

function captureContextSnapshot() {
  const context = getSTContext();
  if (!context) {
    return {
      messages: [],
      userDescription: null,
      characterDescription: null,
    };
  }

  const chatLog = Array.isArray(context.chat) ? context.chat : [];
  const messages = chatLog.slice(-5).map((entry, index) => {
    if (typeof entry === 'string') {
      return { index, speaker: 'unknown', text: entry };
    }
    const text = entry?.mes ?? entry?.text ?? '';
    const speaker =
      entry?.name ||
      (entry?.is_user ? context?.name1 || 'You' : context?.name2 || 'Character') ||
      'unknown';
    return { index, speaker, text };
  });

  const userCard = getUserCard(context);
  const characterCard = getActiveCharacterCard(context);

  return {
    messages,
    userDescription: extractCardDescription(userCard),
    characterDescription: extractCardDescription(characterCard),
  };
}

function getSTContext() {
  if (typeof globalThis.SillyTavern?.getContext === 'function') {
    return globalThis.SillyTavern.getContext();
  }
  if (typeof getContext === 'function') {
    return getContext();
  }
  return null;
}

function getActiveCharacterCard(context) {
  if (!Array.isArray(context?.characters)) return null;
  const idx = Number(context?.characterId);
  if (Number.isInteger(idx) && idx >= 0 && idx < context.characters.length) {
    return context.characters[idx] || null;
  }
  return null;
}

function getUserCard(context) {
  if (context?.user) return context.user;
  if (Array.isArray(context?.characters)) {
    const userCandidate = context.characters.find(
      (character) =>
        character?.is_user ||
        character?.isUser ||
        character?.user === true ||
        character?.data?.role === 'user',
    );
    if (userCandidate) return userCandidate;
  }
  return null;
}

function extractCardDescription(card) {
  if (!card) return null;
  return (
    card.data?.description ??
    card.data?.description_full ??
    card.description ??
    null
  );
}
