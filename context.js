import { getContext } from '../../../extensions.js';
import { power_user } from '../../../power-user.js';
import { getUserAvatar, getUserAvatars, setUserAvatar, user_avatar } from '../../../personas.js';
import { normalizeText } from './text.js';

export function captureContextSnapshot() {
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

export function getSTContext() {
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

function getUserDescription(
  context,
  powerUser = getPowerUserSettings(context),
  persona = getPersonaContext(powerUser),
) {
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
    const personaField = normalizeText(cardFields?.persona);
    if (personaField) return personaField;
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
  if (
    entry.is_system ||
    entry.role === 'system' ||
    entry.type === 'system' ||
    entry.data?.role === 'system'
  ) {
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
