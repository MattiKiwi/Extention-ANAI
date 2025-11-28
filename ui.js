import { renderExtensionTemplateAsync } from '../../../extensions.js';
import { debounce } from '../../../utils.js';
import { LOG_PREFIX, ROOT_ID, extensionPath } from './config.js';
import { captureContextSnapshot } from './context.js';
import { generateStructuredOutputs } from './generation.js';
import { defaultSettings, getSettings, saveSettingsDebounced } from './settings.js';
import { normalizeText, stringifyPrompt } from './text.js';

export function removeExistingUI() {
  document.getElementById(ROOT_ID)?.remove();
}

function populateUI(root) {
  const settings = getSettings();
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
        const settings = getSettings();
        settings[key] = event.target.value;
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
      const settings = getSettings();
      console.log(`${LOG_PREFIX} Generate Image`, {
        scene: settings.scene,
        character: settings.character,
        user: settings.user,
      });
    });
}

export async function mountUI() {
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

async function handleGenerateDescriptionClick(root) {
  const button = $(root).find('#ani-generate-desc');
  if (!button.length || button.data('busy') === true) return;

  button.data('busy', true);
  const originalLabel = button.text();
  button.prop('disabled', true).text('Generating...');

  try {
    const snapshot = captureContextSnapshot();
    const promptText = normalizeText(getSettings().prompt) ?? defaultSettings.prompt;
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

function applyStructuredOutputs(root, structured) {
  if (!structured) return;
  const scene = normalizeText(stringifyPrompt(structured.scene)) ?? '';
  const character = normalizeText(stringifyPrompt(structured.character)) ?? '';
  const user = normalizeText(stringifyPrompt(structured.user)) ?? '';

  const settings = getSettings();
  settings.scene = scene;
  settings.character = character;
  settings.user = user;

  $(root).find('#ani-scene').val(scene);
  $(root).find('#ani-char').val(character);
  $(root).find('#ani-user').val(user);

  saveSettingsDebounced();
}
