import { saveSettingsDebounced, generateRaw as coreGenerateRaw } from '../../../../script.js';
import { debounce } from '../../../utils.js';
import { extension_settings, getContext, renderExtensionTemplateAsync } from '../../../extensions.js';
import { power_user } from '../../../power-user.js';
import { getUserAvatar, getUserAvatars, setUserAvatar, user_avatar } from '../../../personas.js';

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
  prompt: `Generate a concise tag-style prompt describing the current scene. Output only comma-separated tags.
Include the number of characters, their attributes (gender, appearance, clothing, pose, expression), and key scene descriptors (camera angle, composition, environment, mood).
Be specific but concise, using tags similar to: ‘1girl, black hair, grey eyes, head tilt, looking at viewer, close-up, from above’.
Do NOT include full sentences—only descriptive tags.`,
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
    .on('click', async () => {
      await handleGenerateDescriptionClick(root);
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
  ensureSafeMacroWrappers();
  await mountUI();
});

function ensureSafeMacroWrappers() {
  wrapMacroInputAsString('substituteParams');
  wrapMacroInputAsString('evaluateMacros');
}

function wrapMacroInputAsString(functionName) {
  const fn = globalThis?.[functionName];
  if (typeof fn !== 'function' || fn.__ani_safe === true) {
    return;
  }

  const wrapped = function safeMacroWrapper(content, ...rest) {
    let safeContent;
    if (content == null) {
      safeContent = '';
    } else if (typeof content === 'string') {
      safeContent = content;
    } else {
      try {
        safeContent = String(content);
      } catch {
        safeContent = '';
      }
    }
    return fn.call(this, safeContent, ...rest);
  };

  wrapped.__ani_safe = true;
  globalThis[functionName] = wrapped;
}

async function handleGenerateDescriptionClick(root) {
  const button = $(root).find('#ani-generate-desc');
  if (!button.length || button.data('busy') === true) return;

  button.data('busy', true);
  const originalLabel = button.text();
  button.prop('disabled', true).text('Generating...');

  try {
    const snapshot = captureContextSnapshot();
    const promptText = normalizeText(extension_settings[SETTINGS_KEY].prompt) ?? defaultSettings.prompt;
    const structured = await generateStructuredOutputs(promptText, snapshot);

    if (structured) {
      applyStructuredOutputs(root, structured);
      console.log(`${LOG_PREFIX} Structured output`, structured);
    } else {
      console.warn(`${LOG_PREFIX} Structured output request returned no data.`);
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to generate structured output.`, error);
  } finally {
    button.prop('disabled', false).text(originalLabel);
    button.removeData('busy');
  }
}

async function generateStructuredOutputs(prompt, snapshot) {
  ensureSafeMacroWrappers();
  const context = getSTContext();
  const generateQuietPrompt = context?.generateQuietPrompt;
  const generateRawFn = context?.generateRaw ?? coreGenerateRaw;
  if (typeof generateQuietPrompt !== 'function' && typeof generateRawFn !== 'function') {
    console.warn(`${LOG_PREFIX} Neither generateQuietPrompt nor generateRaw are available in the current context.`);
    return null;
  }

  const structuredPrompt = stringifyPrompt(buildStructuredPrompt(prompt, snapshot));
  const jsonSchema = getStructuredOutputSchema();

  console.debug(`${LOG_PREFIX} Structured request payload`, {
    promptType: typeof structuredPrompt,
    prompt: structuredPrompt,
  });

  let rawResult = null;
  try {
    if (typeof generateRawFn === 'function') {
      rawResult = await generateRawFn({
        prompt: structuredPrompt,
        jsonSchema,
      });
    } else {
      rawResult = await generateQuietPrompt({
        quietPrompt: structuredPrompt,
        jsonSchema,
      });
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Structured output request failed.`, error);
    return null;
  }

  const structured = parseStructuredOutput(rawResult);
  if (!structured?.scene && !structured?.character && !structured?.user) {
    return null;
  }

  return structured;
}

function stringifyPrompt(value) {
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

function buildStructuredPrompt(prompt, snapshot) {
  const basePrompt = normalizeText(prompt) ?? defaultSettings.prompt;
  const character = normalizeText(snapshot?.characterDescription) ?? 'No character description provided.';
  const user = normalizeText(snapshot?.userDescription) ?? 'No user description provided.';
  const persona = normalizeText(snapshot?.persona?.description) ?? null;

  const transcript = (snapshot?.messages ?? [])
    .map((message, idx) => {
      const speaker = message?.speaker || `Speaker ${idx + 1}`;
      const text = normalizeText(message?.text ?? stringifyPrompt(message?.text)) ?? '[No text provided]';
      return `${speaker}: ${text}`;
    })
    .join('\n');

  const personaLine = persona ? `Active Persona Description:\n${persona}\n` : '';
  const transcriptBlock = transcript.length ? transcript : '[No recent messages provided]';

  return [
    'You are an assistant that prepares structured prompts for an image generator.',
    'Write vivid but concise descriptions for each requested field. Avoid repeating identical text across fields; make sure each focuses on its intended subject.',
    `Overall directive: ${basePrompt}`,
    personaLine.trim(),
    `Character Description:\n${character}`,
    `User Description:\n${user}`,
    `Recent Dialogue (latest last):\n${transcriptBlock}`,
    'Return only JSON that matches the provided schema.',
    'scene: Summarize the setting, atmosphere, and major actions currently happening.',
    'character: Describe the main non-user character(s) with poses, expressions, outfit, and key traits.',
    'user: Describe the user persona (appearance, clothing, mood, props) for the scene.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function getStructuredOutputSchema() {
  return {
    name: 'AdvancedImagePrompt',
    description: 'Scene, character, and user prompts for image generation.',
    strict: true,
    value: {
      $schema: 'http://json-schema.org/draft-04/schema#',
      type: 'object',
      additionalProperties: false,
      properties: {
        scene: {
          type: 'string',
          description: 'Setting, activity, and mood of the full scene.',
        },
        character: {
          type: 'string',
          description: 'Focus on the non-user characters.',
        },
        user: {
          type: 'string',
          description: 'Focus on the active user persona.',
        },
      },
      required: ['scene', 'character', 'user'],
    },
  };
}

function parseStructuredOutput(rawResult) {
  if (!rawResult) return null;
  if (typeof rawResult === 'object') {
    return rawResult;
  }
  if (typeof rawResult === 'string') {
    try {
      return JSON.parse(rawResult);
    } catch (error) {
      console.error(`${LOG_PREFIX} Unable to parse structured output JSON.`, error, rawResult);
      return null;
    }
  }
  return null;
}

function applyStructuredOutputs(root, structured) {
  if (!structured) return;
  const scene = normalizeText(stringifyPrompt(structured.scene)) ?? '';
  const character = normalizeText(stringifyPrompt(structured.character)) ?? '';
  const user = normalizeText(stringifyPrompt(structured.user)) ?? '';

  extension_settings[SETTINGS_KEY].scene = scene;
  extension_settings[SETTINGS_KEY].character = character;
  extension_settings[SETTINGS_KEY].user = user;

  $(root).find('#ani-scene').val(scene);
  $(root).find('#ani-char').val(character);
  $(root).find('#ani-user').val(user);

  saveSettingsDebounced();
}

function captureContextSnapshot() {
  const context = getSTContext();
  const powerUser = getPowerUserSettings(context);
  const persona = getPersonaContext(powerUser);
  if (!context) {
    return {
      messages: [],
      userDescription: persona?.description ?? null,
      characterDescription: null,
      persona,
    };
  }

  const chatLog = Array.isArray(context.chat) ? context.chat : [];
  const relevantEntries = [];
  chatLog.forEach((entry, idx) => {
    if (isUserOrCharacterMessage(entry)) {
      relevantEntries.push({ entry, idx });
    }
  });

  const recentEntries = relevantEntries.slice(-5);
  const messages = recentEntries.map(({ entry, idx }) => {
    if (typeof entry === 'string') {
      return { index: idx, speaker: 'unknown', text: entry };
    }
    const text = entry?.mes ?? entry?.text ?? '';
    const speaker =
      entry?.name ||
      (entry?.is_user ? context?.name1 || 'You' : context?.name2 || 'Character') ||
      'unknown';
    return { index: idx, speaker, text };
  });

  return {
    messages,
    userDescription: getUserDescription(context, powerUser, persona),
    characterDescription: getCharacterDescription(context),
    persona,
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

function getPowerUserSettings(context) {
  return (
    context?.powerUserSettings ||
    context?.power_user ||
    power_user ||
    globalThis.power_user ||
    null
  );
}

function getPersonaContext(powerUser) {
  const personaId = typeof user_avatar === 'string' && user_avatar.length ? user_avatar : null;
  const descriptor = personaId ? powerUser?.persona_descriptions?.[personaId] : null;
  const description = normalizeText(descriptor?.description);
  const name = personaId ? powerUser?.personas?.[personaId] ?? null : null;
  const avatarPath = personaId ? getUserAvatar(personaId) : null;

  return {
    id: personaId,
    name,
    description: description ?? null,
    avatar: avatarPath,
    refreshPersonas: getUserAvatars,
    setPersona: setUserAvatar,
  };
}

function getUserDescription(context, powerUser = getPowerUserSettings(context), persona = getPersonaContext(powerUser)) {
  if (!context && !persona?.description) return null;

  const personaSources = [
    persona?.description,
    powerUser?.persona_description,
    powerUser?.personaDescription,
    context?.persona_description,
    context?.personaDescription,
    context?.user_definition,
    context?.userDefinition,
  ];

  for (const value of personaSources) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }

  if (typeof context?.getCharacterCardFields === 'function') {
    const cardFields = context.getCharacterCardFields({
      chid: context?.characterId ?? context?.character_id ?? null,
    });
    const persona = normalizeText(cardFields?.persona);
    if (persona) return persona;
  }

  const userCard = getUserCard(context);
  return extractCardDescription(userCard);
}

function getCharacterDescription(context) {
  if (!context) return null;
  const characterCard = getActiveCharacterCard(context);
  const description = extractCardDescription(characterCard);
  if (description) return description;

  const fallbacks = [
    context?.character_description,
    context?.characterDescription,
    context?.description,
  ];

  for (const value of fallbacks) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }

  return null;
}

function isUserOrCharacterMessage(entry) {
  if (entry == null) return false;
  if (typeof entry === 'string') return true;
  if (entry.is_system || entry.role === 'system' || entry.type === 'system' || entry.data?.role === 'system') {
    return false;
  }
  if (typeof entry.is_user === 'boolean') {
    return true;
  }
  const role = entry.role ?? entry.data?.role;
  if (role === 'assistant' || role === 'user') {
    return true;
  }
  return false;
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

function normalizeText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}
