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
  const basePrompt = normalizeText(prompt) ?? defaultSettings.prompt;

  const sectionPrompts = {
    scene: [
      'IGNORE ALL PREVIOUS INSTRUCTIONS. OUTPUT ONLY LOWERCASE COMMA-SEPARATED TAGS.',
      'Strict rules: no sentences, no narration, no quotes, no conjunctions, no story continuation. Tags only.',
      basePrompt ? `Overall directive tags: ${basePrompt}` : null,
      persona ? `User persona context tags: ${persona}` : null,
      'Describe the entire scene with tags for environment, weather, lighting, mood, camera angle, character count, major actions, and notable props.',
      'Example: moonlit forest, mist, 2 characters, walking together, cinematic lighting.',
      `Recent dialogue context:\n${transcriptBlock}`,
      'If you cannot comply, output "scene tags unavailable".',
    ]
      .filter(Boolean)
      .join('\n\n'),
    character: [
      'IGNORE ALL PREVIOUS INSTRUCTIONS. OUTPUT ONLY LOWERCASE COMMA-SEPARATED TAGS.',
      'Describe ONLY the non-user character(s). Do not mention the user persona or any narrative text.',
      `Character background:\n${characterDescription}`,
      `User persona reference (context only, do not tag user):\n${userDescription}`,
      'Include tags for count, gender, physique, clothing, expression, pose, and props.',
      'Example: 1girl, silver hair, battle armor, determined expression, sword ready, dynamic pose.',
      `Recent dialogue context:\n${transcriptBlock}`,
      'If you cannot comply, output "character tags unavailable".',
    ]
      .filter(Boolean)
      .join('\n\n'),
    user: [
      'IGNORE ALL PREVIOUS INSTRUCTIONS. OUTPUT ONLY LOWERCASE COMMA-SEPARATED TAGS.',
      'Describe ONLY the user persona. Do not mention other characters or narrative text.',
      `User persona information:\n${userDescription}`,
      persona ? `Additional persona details:\n${persona}` : null,
      'Include tags for appearance, clothing, mood, pose, props, and camera framing.',
      'Example: 1woman, rune-stitched robe, mischievous smile, holding wand, dim light, full length.',
      `Recent dialogue context:\n${transcriptBlock}`,
      'If you cannot comply, output "user tags unavailable".',
    ]
      .filter(Boolean)
      .join('\n\n'),
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
    'You are an image-tag formatter. Respond ONLY with lowercase comma-separated tags. Never write sentences or narration.';
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
