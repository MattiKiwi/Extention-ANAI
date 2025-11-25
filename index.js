(() => {
  const EXTENSION_ID = 'advanced-nai-image';
  const EXTENSION_NAME = 'Advanced NAI Image';
  const ROOT_ID = 'ani-ext-root';
  const SETTINGS_PANES = ['#extensions_settings2', '#extensions_settings'];

  let observer;

  const layout = `
<div id="${ROOT_ID}" class="ani-ext">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header" title="Advanced Novel AI Image UI">
      <b>Advanced NAI Image (UI)</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div class="ani-form">

        <!-- 1) Prompt used to generate the scene description -->
        <div class="ani-block">
          <label class="ani-label" for="ani-prompt">Prompt for scene description</label>
          <textarea id="ani-prompt" class="text_pole textarea_compact" rows="3"
            placeholder="e.g., Summarize chapter into a vivid scene setup…"></textarea>
        </div>

        <!-- 2) Scene description -->
        <div class="ani-block">
          <label class="ani-label" for="ani-scene">Scene description</label>
          <textarea id="ani-scene" class="text_pole textarea_compact" rows="4"
            placeholder="A windswept cliff at dusk…"></textarea>
        </div>

        <!-- 3–4) Character descriptions -->
        <div class="ani-grid">
          <div class="ani-block">
            <label class="ani-label" for="ani-char">Character description (character)</label>
            <textarea id="ani-char" class="text_pole textarea_compact" rows="3"
              placeholder="The rogue: lean, scar over left brow…"></textarea>
          </div>
          <div class="ani-block">
            <label class="ani-label" for="ani-user">Character description (user)</label>
            <textarea id="ani-user" class="text_pole textarea_compact" rows="3"
              placeholder="The user avatar / self-insert…"></textarea>
          </div>
        </div>

        <!-- Actions -->
        <div class="ani-actions">
          <button id="ani-generate-desc" class="menu_button" type="button">Generate Description</button>
          <button id="ani-generate-image" class="menu_button" type="button">Generate Image</button>
        </div>

      </div>
    </div>
  </div>
</div>
`.trim();

  function getSettingsPane() {
    for (const selector of SETTINGS_PANES) {
      const pane = document.querySelector(selector);
      if (pane) return pane;
    }
    return null;
  }

  function wireEvents(host) {
    const promptInput = host.querySelector('#ani-prompt');
    const sceneInput = host.querySelector('#ani-scene');
    const characterInput = host.querySelector('#ani-char');
    const userInput = host.querySelector('#ani-user');
    const descriptionButton = host.querySelector('#ani-generate-desc');
    const imageButton = host.querySelector('#ani-generate-image');

    descriptionButton?.addEventListener('click', () => {
      const prompt = promptInput?.value || '';
      console.log(`[${EXTENSION_NAME}] Generate Description — prompt:`, prompt);
    });

    imageButton?.addEventListener('click', () => {
      const payload = {
        scene: sceneInput?.value || '',
        character: characterInput?.value || '',
        user: userInput?.value || '',
      };
      console.log(`[${EXTENSION_NAME}] Generate Image — inputs:`, payload);
    });
  }

  function mount() {
    const settingsPane = getSettingsPane();
    if (!settingsPane) return false;
    if (settingsPane.querySelector(`#${ROOT_ID}`)) return true;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = layout;
    const root = wrapper.firstElementChild;
    if (!root) return false;

    settingsPane.appendChild(root);
    wireEvents(root);

    return true;
  }

  function enableObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver(() => {
      mount();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  async function init() {
    try {
      if (document.body) {
        mount();
        enableObserver();
      } else {
        document.addEventListener(
          'DOMContentLoaded',
          () => {
            mount();
            enableObserver();
          },
          { once: true },
        );
      }
      return true;
    } catch (error) {
      console.error(`[${EXTENSION_NAME}] Failed to initialize`, error);
      return false;
    }
  }

  function unload() {
    observer?.disconnect();
    observer = undefined;
    document.getElementById(ROOT_ID)?.remove();
  }

  function register(attempt = 0) {
    if (typeof registerExtension === 'function') {
      registerExtension({
        name: EXTENSION_ID,
        fullName: EXTENSION_NAME,
        version: '0.1.0',
        init,
        unload,
      });
      return;
    }

    if (attempt > 20) {
      console.error(
        `[${EXTENSION_NAME}] Could not find registerExtension(); giving up.`,
      );
      return;
    }

    // registerExtension might not be defined yet; wait for ST to finish booting.
    setTimeout(() => register(attempt + 1), 250);
  }

  register();
})();
