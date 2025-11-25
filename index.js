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
  const list = flattenCollection(context?.characters);
  if (!list.length) return null;

  const idx = Number(context?.characterId);
  if (Number.isInteger(idx) && idx >= 0 && idx < list.length) {
    return list[idx] || null;
  }

  if (typeof context?.characterId === 'string') {
    const match =
      list.find(
        (character) =>
          character?.avatar === context.characterId || character?.id === context.characterId,
      ) || null;
    if (match) return match;
  }

  return list[0] || null;
}

function getUserCard(context) {
  if (context?.user) return context.user;
  if (context?.userCard) return context.userCard;
  const profileCard = getProfileCard(context);
  if (profileCard) return profileCard;

  const nameHints = new Set(
    [context?.name1, context?.user_name, context?.userName, context?.username]
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim().toLowerCase()),
  );

  const candidates = [
    ...flattenCollection(context?.characters),
    ...flattenCollection(context?.characterCache),
    ...flattenCollection(context?.groupCharacters),
  ];

  const match = candidates.find((character) => isUserCharacter(character, nameHints));
  if (match) return match;

  if (
    context?.persona ||
    context?.persona_description ||
    context?.user_definition ||
    context?.userDefinition
  ) {
    return {
      name: context?.name1 || 'User',
      data: {
        description:
          context?.persona_description ??
          context?.persona ??
          context?.user_definition ??
          context?.userDefinition ??
          null,
      },
    };
  }

  return null;
}

function flattenCollection(collection) {
  if (!collection) return [];
  if (collection instanceof Map) {
    return Array.from(collection.values()).filter(Boolean);
  }
  if (Array.isArray(collection)) {
    return collection.filter(Boolean);
  }
  if (typeof collection === 'object') {
    return Object.values(collection).filter(Boolean);
  }
  return [];
}

function isUserCharacter(character, nameHints) {
  if (!character) return false;
  if (
    character.is_user ||
    character.isUser ||
    character.isYou ||
    character.user === true ||
    character.type === 'user' ||
    character.role === 'user' ||
    character.data?.role === 'user'
  ) {
    return true;
  }
  const normalized = normalizeName(character);
  if (normalized && nameHints.has(normalized)) {
    return true;
  }
  return false;
}

function normalizeName(character) {
  const value =
    character?.name ||
    character?.display_name ||
    character?.title ||
    character?.data?.name ||
    character?.data?.display_name;
  return typeof value === 'string' ? value.trim().toLowerCase() : null;
}

function getProfileCard(context) {
  const profileManager = context?.profile_manager ?? context?.profileManager;
  const managerProfiles = flattenCollection(profileManager?.profiles);
  const fallbackProfiles = managerProfiles.length
    ? []
    : flattenCollection(context?.profiles);
  const profilesSource = managerProfiles.length ? managerProfiles : fallbackProfiles;
  const profileId =
    profileManager?.currentProfile ??
    profileManager?.selectedProfile ??
    profileManager?.activeProfile ??
    context?.profileId ??
    context?.profile_id;

  let activeProfile = null;
  if (profileId != null) {
    activeProfile =
      (Array.isArray(profileManager?.profiles)
        ? profileManager.profiles.find((profile) => profile?.id === profileId)
        : profileManager?.profiles?.[profileId]) ??
      (Array.isArray(context?.profiles)
        ? context.profiles.find((profile) => profile?.id === profileId)
        : context?.profiles?.[profileId]);
  }

  if (!activeProfile) {
    activeProfile =
      profilesSource.find((profile) => profile?.selected) ??
      profilesSource.find((profile) => profile?.isDefault) ??
      profilesSource[0] ??
      null;
  }

  if (!activeProfile) return null;

  const description =
    activeProfile?.description ??
    activeProfile?.persona ??
    activeProfile?.bio ??
    activeProfile?.profile ??
    activeProfile?.prompt ??
    activeProfile?.data?.description ??
    null;

  return {
    name:
      activeProfile?.name ||
      activeProfile?.title ||
      activeProfile?.displayName ||
      context?.name1 ||
      'User',
    data: {
      description: description ?? null,
    },
  };
}

function extractCardDescription(card) {
  if (!card) return null;
  const fields = [
    card.data?.description,
    card.data?.description_full,
    card.data?.persona,
    card.data?.personality,
    card.data?.bio,
    card.description,
    card.persona,
    card.bio,
  ];
  for (const field of fields) {
    if (typeof field === 'string' && field.trim()) {
      return field.trim();
    }
  }
  return null;
}
