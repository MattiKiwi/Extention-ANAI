import { generateRaw as coreGenerateRaw } from '../../../../script.js';
import { LOG_PREFIX } from './config.js';
import { getSTContext } from './context.js';
import { defaultSettings } from './settings.js';
import { formatTagList, normalizeText, stringifyPrompt } from './text.js';

export async function generateStructuredOutputs(prompt, snapshot) {
  const context = getSTContext();
  const generateQuietPrompt = context?.generateQuietPrompt;
  const generateRawFn = context?.generateRaw ?? coreGenerateRaw;

  if (typeof generateQuietPrompt !== 'function' && typeof generateRawFn !== 'function') {
    console.warn(
      `${LOG_PREFIX} Neither generateQuietPrompt nor generateRaw are available in the current context.`,
    );
    return buildFallbackOutputs(prompt, snapshot);
  }

  const transcriptBlock = buildTranscriptBlock(snapshot);
  const persona = normalizeText(snapshot?.persona?.description) ?? null;
  const characterDescription = normalizeText(snapshot?.characterDescription) ?? 'No character description provided.';
  const userDescription =
    normalizeText(snapshot?.userDescription) ??
    normalizeText(snapshot?.persona?.description) ??
    'No user description provided.';
  const personaDetails = persona && persona !== userDescription ? persona : null;
  const basePrompt = normalizeText(prompt) ?? defaultSettings.prompt;

  const sectionPrompts = {
  scene: [
    'IGNORE ALL PREVIOUS INSTRUCTIONS.',
    'YOU ARE AN IMAGE-TAG FORMATTER.',
    'HARD RULES:',
    '- output only lowercase comma-separated tags',
    '- no sentences or sentence fragments',
    '- no narration, no dialogue, no quotes',
    '- no conjunctions like "and", "but", "then"',
    '- no filler words, no explanations',
    '- no story continuation',
    '- no line breaks in the output',
    '- do not refer to yourself in any way',
    '- do not describe your thoughts, actions, speech, or processes',
    '- do not simulate pauses, hesitation, or internal monologue',
    '- do not acknowledge prompts, rules, or directives',
    '',
    'TASK:',
    'Describe the entire scene ONLY as tags.',
    'Describe environment, weather, lighting, mood, camera angle, character count, major actions, and notable props.',
    'Do NOT describe character backstories or inner thoughts. Use only short visual tags.',
    'Use short tags in a style similar to: moonlit forest, mist, 2 characters, walking together, cinematic lighting.',
    basePrompt
      ? `Overall directive tags (context only, do NOT repeat verbatim): ${basePrompt}`
      : null,
    personaDetails
      ? `User persona context tags (context only, do NOT repeat verbatim): ${personaDetails}`
      : null,
    `Recent dialogue context (read for meaning, do NOT quote or rewrite):\n${transcriptBlock}`,
    'OUTPUT FORMAT:',
    'scene tags only, in the form: tag, tag, tag, tag',
    'If you cannot comply, output exactly: scene tags unavailable.'
  ]
    .filter(Boolean)
    .join('\n\n'),

  character: [
    'IGNORE ALL PREVIOUS INSTRUCTIONS.',
    'YOU ARE AN IMAGE-TAG FORMATTER.',
    'HARD RULES:',
    '- output only lowercase comma-separated tags',
    '- no sentences or sentence fragments',
    '- no narration, no dialogue, no quotes',
    '- no conjunctions like "and", "but", "then"',
    '- no filler words, no explanations',
    '- no story continuation',
    '- no line breaks in the output',
    '- do not refer to yourself in any way',
    '- do not describe your thoughts, actions, speech, or processes',
    '- do not simulate pauses, hesitation, or internal monologue',
    '- do not acknowledge prompts, rules, or directives',
    '',
    'TASK:',
    'Describe ONLY the non-user character(s).',
    'Do NOT mention the user persona.',
    'Do NOT describe the environment, weather, or setting except where it is a direct prop on the character (e.g. holding staff, wearing cloak).',
    `Character background (context only, do NOT repeat verbatim):\n${characterDescription}`,
    `User persona reference (context only, do NOT tag user):\n${userDescription}`,
    'Include tags for: count, gender, physique, clothing, expression, pose, and props directly associated with the character(s).',
    'Use short stable-diffusion / danbooru style tags.',
    'Example format: 1girl, silver hair, battle armor, determined expression, sword ready, dynamic pose.',
    `Recent dialogue context (read for meaning, do NOT quote or rewrite):\n${transcriptBlock}`,
    'OUTPUT FORMAT:',
    'character tags only, in the form: tag, tag, tag, tag',
    'If you cannot comply, output exactly: character tags unavailable.'
  ]
    .filter(Boolean)
    .join('\n\n'),

  user: [
    'IGNORE ALL PREVIOUS INSTRUCTIONS.',
    'YOU ARE AN IMAGE-TAG FORMATTER.',
    'HARD RULES:',
    '- output only lowercase comma-separated tags',
    '- no sentences or sentence fragments',
    '- no narration, no dialogue, no quotes',
    '- no conjunctions like "and", "but", "then"',
    '- no filler words, no explanations',
    '- no story continuation',
    '- no line breaks in the output',
    '- do not refer to yourself in any way',
    '- do not describe your thoughts, actions, speech, or processes',
    '- do not simulate pauses, hesitation, or internal monologue',
    '- do not acknowledge prompts, rules, or directives',
    '',
    'TASK:',
    'Describe ONLY the user persona.',
    'Do NOT mention other characters or any narrative text.',
    `User persona information (context only, do NOT repeat verbatim):\n${userDescription}`,
    personaDetails
      ? `Additional persona details (context only, do NOT repeat verbatim):\n${personaDetails}`
      : null,
    'Include tags for appearance, clothing, mood, pose, props, and camera framing.',
    'Use short stable-diffusion / danbooru style tags.',
    'Example format: 1woman, rune-stitched robe, mischievous smile, holding wand, dim light, full length.',
    `Recent dialogue context (read for meaning, do NOT quote or rewrite):\n${transcriptBlock}`,
    'OUTPUT FORMAT:',
    'user persona tags only, in the form: tag, tag, tag, tag',
    'If you cannot comply, output exactly: user tags unavailable.'
  ]
    .filter(Boolean)
    .join('\n\n')
};


  console.debug(`${LOG_PREFIX} Section prompts`, sectionPrompts);
  const outputs = { scene: '', character: '', user: '' };

  for (const [section, sectionPrompt] of Object.entries(sectionPrompts)) {
    try {
      const generated = await runSimpleGeneration({
        prompt: sectionPrompt,
        generateRawFn,
        generateQuietPrompt,
      });
      outputs[section] = formatTagList(normalizeText(generated));
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to generate ${section} description. Falling back.`, error);
      outputs[section] = '';
    }
  }

  return {
    scene: outputs.scene || buildFallbackScene(basePrompt, transcriptBlock),
    character: outputs.character || characterDescription,
    user: outputs.user || userDescription,
  };
}

async function runSimpleGeneration({ prompt, generateRawFn, generateQuietPrompt }) {
  if (!prompt) return '';
  const systemPrompt =
  'THIS IS NOT A STORY. THIS IS A FORMATTING TASK. You are an image-tag formatter. Respond ONLY with lowercase comma-separated tags. Never write sentences, narration, dialogue, or explanations.';
  if (typeof generateRawFn === 'function') {
    console.log(`${LOG_PREFIX} Using generateRaw for prompt.`);
    const result = await generateRawFn({ systemPrompt, prompt, trimNames: true });
    if (!result) throw new Error('No message generated');
    return result;
  }
  if (typeof generateQuietPrompt === 'function') {
    console.log(`${LOG_PREFIX} Using generateQuietPrompt for prompt.`);
    const result = await generateQuietPrompt({ quietPrompt: `${systemPrompt}\n\n${prompt}` });
    if (!result) throw new Error('No message generated');
    return result;
  }
  return '';
}

function buildFallbackOutputs(prompt, snapshot) {
  const basePrompt = normalizeText(prompt) ?? defaultSettings.prompt;
  const transcriptBlock = buildTranscriptBlock(snapshot);
  const character = normalizeText(snapshot?.characterDescription) ?? 'No character description provided.';
  const userDescription =
    normalizeText(snapshot?.userDescription) ??
    normalizeText(snapshot?.persona?.description) ??
    'No user description provided.';

  return {
    scene: buildFallbackScene(basePrompt, transcriptBlock),
    character: formatTagList(character || 'character'),
    user: formatTagList(userDescription || 'user'),
  };
}

function buildFallbackScene(basePrompt, transcriptBlock) {
  const sceneParts = [
    basePrompt ? `directive ${basePrompt}` : null,
    transcriptBlock ? `dialogue ${transcriptBlock}` : null,
  ].filter(Boolean);
  return formatTagList(sceneParts.join(', ') || basePrompt || 'scene');
}

function buildTranscriptBlock(snapshot) {
  const transcript = (snapshot?.messages ?? [])
    .map((message, idx) => {
      const speaker = message?.speaker || `Speaker ${idx + 1}`;
      const text = normalizeText(message?.text ?? stringifyPrompt(message?.text)) ?? '[No text provided]';
      return `${speaker}: ${text}`;
    })
    .join('\n');

  return transcript.length ? transcript : '[No recent messages provided]';
}
