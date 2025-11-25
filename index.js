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
      if (snapshot.debug) {
        console.debug(`${LOG_PREFIX} Context diagnostics`, snapshot.debug);
      }
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
      debug: null,
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

  return {
    messages,
    userDescription: getUserDescription(context),
    characterDescription: getCharacterDescription(context),
    debug: buildContextDiagnostics(context),
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

function getUserDescription(context) {
  const settings = getPowerUserSettings(context);
  if (!settings) return null;

  const directDescription = normalizeText(settings.persona_description);
  if (directDescription) return directDescription;

  const personaDescriptor = resolvePersonaDescriptor(settings, context?.chatMetadata);
  const descriptorDescription = personaDescriptor && normalizeText(personaDescriptor.description);
  if (descriptorDescription) return descriptorDescription;

  const fallbackFields = [
    settings.persona,
    settings.persona_definition,
    settings.personaDefinition,
    settings.user_definition,
    settings.userDefinition,
  ];

  for (const field of fallbackFields) {
    const candidate = normalizeText(field);
    if (candidate) return candidate;
  }

  return null;
}

function resolvePersonaDescriptor(settings, chatMetadata) {
  const descriptors = settings?.persona_descriptions;
  if (!descriptors || typeof descriptors !== 'object') return null;

  const preferredIds = [
    chatMetadata?.persona,
    settings?.default_persona,
  ].filter((id) => typeof id === 'string' && id in descriptors);

  const searchOrder = preferredIds.length ? preferredIds : Object.keys(descriptors);
  for (const id of searchOrder) {
    const descriptor = descriptors[id];
    if (descriptor && typeof descriptor === 'object') {
      return descriptor;
    }
  }

  return null;
}

function getCharacterDescription(context) {
  const character = resolveCharacter(context);
  if (!character) return null;

  const fields = [
    character.description,
    character.data?.description,
    character.data?.persona,
    character.personality,
    character.data?.personality,
    character.data?.extensions?.depth_prompt?.prompt,
    character.scenario,
    character.data?.scenario,
  ];

  for (const field of fields) {
    const text = normalizeText(field);
    if (text) return text;
  }

  return null;
}

function resolveCharacter(context) {
  const list = context?.characters;
  if (!list) return null;

  const characterId = context?.characterId;
  if (Array.isArray(list)) {
    const idx = Number(characterId);
    if (Number.isInteger(idx) && idx >= 0 && idx < list.length) {
      return list[idx];
    }
  }

  if (typeof list === 'object') {
    if (characterId && list[characterId]) {
      return list[characterId];
    }
    const numericKey = Number(characterId);
    if (!Number.isNaN(numericKey) && list[numericKey]) {
      return list[numericKey];
    }
  }

  return null;
}

function normalizeText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function getPowerUserSettings(context) {
  if (context?.powerUserSettings) {
    return context.powerUserSettings;
  }

  const globalPowerUser =
    globalThis.power_user ||
    globalThis.powerUser ||
    globalThis?.SillyTavern?.power_user ||
    null;

  if (globalPowerUser) {
    return globalPowerUser;
  }

  return context?.extensionSettings?.power_user ?? null;
}

function buildContextDiagnostics(context) {
  try {
    const powerUser = getPowerUserSettings(context);
    const descriptors = powerUser?.persona_descriptions;
    const descriptorKeys = descriptors && typeof descriptors === 'object' ? Object.keys(descriptors) : [];
    const characters = context?.characters;
    const characterSummary = [];
    if (Array.isArray(characters)) {
      characters.forEach((character, index) => {
        if (character) {
          characterSummary.push({
            index,
            name: character.name ?? character.data?.name ?? null,
            avatar: character.avatar ?? null,
          });
        }
      });
    } else if (characters && typeof characters === 'object') {
      Object.keys(characters).forEach((key) => {
        const character = characters[key];
        if (character) {
          characterSummary.push({
            key,
            name: character.name ?? character.data?.name ?? null,
            avatar: character.avatar ?? null,
          });
        }
      });
    }
    return {
      hasPowerUserSettings: Boolean(powerUser),
      personaDescription: powerUser?.persona_description ?? null,
      personaDescriptorKeys: descriptorKeys.slice(0, 5),
      personaDescriptorCount: descriptorKeys.length,
      defaultPersona: powerUser?.default_persona ?? null,
      chatPersona: context?.chatMetadata?.persona ?? null,
      characterId: context?.characterId ?? null,
      availableCharacterCount: characterSummary.length,
      sampleCharacters: characterSummary.slice(0, 5),
    };
  } catch (error) {
    return { error: String(error) };
  }
}
