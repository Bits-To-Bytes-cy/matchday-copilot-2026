/**
 * ============================================================
 *  MatchDay Copilot — Application Entry Point
 * ============================================================
 *
 *  Initializes the UI, wires DOM events, and orchestrates
 *  the chat experience between the user and GeminiService.
 *
 *  Responsibilities:
 *    • Chat message rendering with smooth animations
 *    • Input state management (disable during API calls)
 *    • Character count validation (500 char limit)
 *    • Typing indicator lifecycle
 *    • Settings modal (API key persistence)
 *    • Persona mode switching (Fan / Staff)
 *    • Basic markdown rendering for AI responses
 *
 *  Note: Pure logic formatting/utility functions have been extracted
 *  to utils.js so this module only handles DOM references,
 *  rendering, and event wiring.
 *
 *  @module app
 */

import config, { saveToStorage } from './config.js';
import { GeminiService, stadiumState } from './api.js';
import { escapeHtml, renderMarkdown, getTrafficLevel, getCharCountStyle } from './utils.js';

// ─── Constants ───────────────────────────────────────────────

/** @type {number} Maximum characters allowed per chat message */
const MAX_CHAR_COUNT = 500;

// ─── DOM References ──────────────────────────────────────────

/** @type {HTMLFormElement}      */ const chatForm         = document.getElementById('chat-form');
/** @type {HTMLInputElement}     */ const chatInput        = document.getElementById('chat-input');
/** @type {HTMLButtonElement}    */ const sendBtn          = document.getElementById('send-btn');
/** @type {HTMLDivElement}       */ const chatMessages     = document.getElementById('chat-messages');
/** @type {HTMLDivElement}       */ const typingIndicator  = document.getElementById('typing-indicator');
/** @type {HTMLSpanElement}      */ const statusDot        = document.getElementById('status-dot');
/** @type {HTMLSpanElement}      */ const statusText       = document.getElementById('status-text');
/** @type {HTMLSpanElement}      */ const charCountDisplay = document.getElementById('char-count-display');
/** @type {HTMLSpanElement}      */ const inputErrorMsg    = document.getElementById('input-error-msg');
/** @type {HTMLSelectElement}    */ const personaSelect    = document.getElementById('persona-select');
/** @type {HTMLButtonElement}    */ const settingsBtn      = document.getElementById('settings-btn');
/** @type {HTMLDialogElement}    */ const settingsDialog   = document.getElementById('settings-dialog');
/** @type {HTMLButtonElement}    */ const settingsCloseBtn = document.getElementById('settings-close-btn');
/** @type {HTMLInputElement}     */ const apiKeyInput      = document.getElementById('api-key-input');
/** @type {HTMLButtonElement}    */ const settingsSaveBtn  = document.getElementById('settings-save-btn');
/** @type {HTMLDivElement}       */ const settingsFeedback = document.getElementById('settings-feedback');
/** @type {HTMLUListElement}     */ const gateStatusList   = document.getElementById('gate-status-list');

// ─── Service Instance ────────────────────────────────────────

/** @type {GeminiService} */
const gemini = new GeminiService();

// ─── State ───────────────────────────────────────────────────

/** @type {boolean} Prevents duplicate submissions while awaiting a response */
let isProcessing = false;

// ─── Chat Functions ──────────────────────────────────────────

/**
 * Appends a chat bubble to the messages container with a smooth
 * slide-up animation. User messages are right-aligned; AI messages
 * are left-aligned with markdown rendering.
 *
 * @param {string}         text   - The message text to display.
 * @param {'user'|'ai'}    sender - Identifies who sent the message.
 * @returns {void}
 */
const appendMessage = (text, sender) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-bubble flex gap-3 items-start';
    wrapper.setAttribute('role', 'article');
    wrapper.setAttribute('aria-label', `${sender === 'user' ? 'You' : 'Assistant'} said`);

    const isUser = sender === 'user';

    /* ── Avatar ── */
    const avatar = document.createElement('div');
    avatar.className = [
        'w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center',
        'text-xs font-bold text-white',
        isUser
            ? 'bg-gradient-to-br from-accent-gold to-orange-500 order-last'
            : 'bg-gradient-to-br from-accent-cyan to-accent-magenta',
    ].join(' ');
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = isUser ? 'You' : 'AI';

    /* ── Bubble ── */
    const bubble = document.createElement('div');
    bubble.className = [
        'rounded-2xl px-4 py-3 max-w-[85%] text-sm leading-relaxed',
        isUser
            ? 'bg-accent-cyan/10 text-accent-cyan rounded-tr-sm ml-auto'
            : 'bg-stadium-light text-gray-200 rounded-tl-sm',
    ].join(' ');

    if (isUser) {
        bubble.textContent = text;
        wrapper.classList.add('flex-row-reverse');
    } else {
        bubble.innerHTML = renderMarkdown(text);
    }

    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
    chatMessages.appendChild(wrapper);

    chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
};

/**
 * Shows or hides the typing indicator with proper ARIA announcements.
 *
 * @param {boolean} visible - Whether the indicator should be shown.
 * @returns {void}
 */
const showTyping = (visible) => {
    typingIndicator.classList.toggle('hidden', !visible);
    typingIndicator.setAttribute('aria-label',
        visible ? 'Assistant is typing a response' : ''
    );
    if (visible) {
        chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
    }
};

/**
 * Toggles the interactive state of the chat input and send button.
 *
 * @param {boolean} disabled - True to disable, false to re-enable.
 * @returns {void}
 */
const setInputDisabled = (disabled) => {
    chatInput.disabled = disabled;
    sendBtn.disabled   = disabled;
    sendBtn.setAttribute('aria-disabled', String(disabled));
    chatInput.setAttribute('placeholder',
        disabled ? 'Waiting for response...' : 'Ask about the stadium, matches, food...'
    );
};

/**
 * Updates the connection status indicator in the header.
 *
 * @param {'connected'|'error'|'loading'} state - The new status.
 * @returns {void}
 */
const setStatus = (state) => {
    const styles = {
        connected: { dot: 'bg-green-400 animate-pulse', text: 'Connected' },
        error:     { dot: 'bg-red-400',                 text: 'Error' },
        loading:   { dot: 'bg-yellow-400 animate-pulse', text: 'Sending...' },
    };
    const { dot, text } = styles[state] || styles.connected;
    statusDot.className    = `w-2 h-2 rounded-full ${dot}`;
    statusText.textContent = text;
};

// ─── Character Counter ───────────────────────────────────────

/**
 * Updates the character count display and shows/hides the error
 * message when the limit is approached or exceeded.
 *
 * @returns {void}
 */
const updateCharCount = () => {
    const len = chatInput.value.length;
    charCountDisplay.textContent = `${len} / ${MAX_CHAR_COUNT}`;

    const style = getCharCountStyle(len, MAX_CHAR_COUNT);
    charCountDisplay.classList.add(style.addClass);
    charCountDisplay.classList.remove(...style.removeClasses);

    if (style.state === 'over') {
        showInputError(`Message exceeds ${MAX_CHAR_COUNT} characters. Please shorten it.`);
    } else {
        hideInputError();
    }
};

/**
 * Displays a validation error below the input.
 *
 * @param {string} message - The error text to show.
 * @returns {void}
 */
const showInputError = (message) => {
    inputErrorMsg.textContent = message;
    inputErrorMsg.classList.remove('hidden');
};

/**
 * Hides the validation error below the input.
 *
 * @returns {void}
 */
const hideInputError = () => {
    inputErrorMsg.textContent = '';
    inputErrorMsg.classList.add('hidden');
};

// ─── Settings Modal ──────────────────────────────────────────

/**
 * Opens the settings dialog as a modal.
 * Pre-fills the API key field if a key exists.
 *
 * @returns {void}
 */
const openSettings = () => {
    /* Pre-fill with existing key (masked in the input type=password) */
    apiKeyInput.value = gemini.apiKey || '';
    settingsFeedback.classList.add('hidden');
    settingsDialog.showModal();
};

/**
 * Closes the settings dialog.
 *
 * @returns {void}
 */
const closeSettings = () => {
    settingsDialog.close();
};

/**
 * Saves the API key to localStorage, updates the GeminiService
 * instance, and provides visual feedback.
 *
 * @returns {void}
 */
const saveSettings = () => {
    const key = apiKeyInput.value.trim();

    if (!key) {
        settingsFeedback.textContent = '⚠️ Please enter a valid API key.';
        settingsFeedback.className = 'text-sm rounded-lg px-4 py-2 bg-red-500/10 text-red-400';
        settingsFeedback.classList.remove('hidden');
        return;
    }

    /* Persist to localStorage */
    saveToStorage('gemini_api_key', key);

    /* Update the live service instance */
    gemini.setApiKey(key);

    /* Visual feedback */
    settingsFeedback.textContent = '✅ API key saved. You are now connected!';
    settingsFeedback.className = 'text-sm rounded-lg px-4 py-2 bg-green-500/10 text-green-400';
    settingsFeedback.classList.remove('hidden');

    setStatus('connected');

    /* Auto-close after brief confirmation */
    setTimeout(() => closeSettings(), 1200);
};

// ─── Persona Switching ───────────────────────────────────────

/**
 * Handles persona mode changes from the dropdown.
 * Updates the GeminiService and appends a system message.
 *
 * @returns {void}
 */
const handlePersonaChange = () => {
    const mode = personaSelect.value;
    gemini.setPersona(mode);

    const label = mode === 'staff' ? '🛡️ Staff/Volunteer Mode' : '⚽ Fan Mode';
    appendMessage(`Switched to **${label}**. Conversation history cleared.`, 'ai');
};

// ─── Gate Status Rendering ───────────────────────────────────

/**
 * Renders the stadiumState object into the #gate-status-list <ul>.
 * Each gate becomes a list item with a colored status dot, the gate
 * name, a text traffic label, and the full status description.
 *
 * This is the same data object injected into the AI's system
 * instruction via _buildSystemInstruction(), proving the
 * "real-time decision support" is sourced from a single truth.
 *
 * @returns {void}
 */
const renderGateStatus = () => {
    const fragment = document.createDocumentFragment();
    const gateNames = { gateA: 'Gate A', gateB: 'Gate B', gateC: 'Gate C' };

    for (const [key, status] of Object.entries(stadiumState)) {
        const { dotColor, textClass, level } = getTrafficLevel(status);
        const displayName = gateNames[key] || key;

        const li = document.createElement('li');
        li.setAttribute('role', 'listitem');
        li.className = 'bg-stadium-dark rounded-xl px-4 py-3 border border-surface-border';

        li.innerHTML = [
            `<div class="flex items-center gap-3 mb-1">`,
            `  <span class="w-2.5 h-2.5 rounded-full ${dotColor} flex-shrink-0" aria-hidden="true"></span>`,
            `  <span class="text-sm font-semibold text-white">${escapeHtml(displayName)}</span>`,
            `  <span class="text-xs font-medium ${textClass} ml-auto">${escapeHtml(level)} Traffic</span>`,
            `</div>`,
            `<p class="text-xs text-gray-400 leading-relaxed pl-5.5">${escapeHtml(status)}</p>`,
        ].join('\n');

        fragment.appendChild(li);
    }

    gateStatusList.innerHTML = '';
    gateStatusList.appendChild(fragment);
};

// ─── Event Handlers ──────────────────────────────────────────

/**
 * Handles chat form submission with full validation pipeline:
 *  1. Double-submission guard
 *  2. Empty message guard
 *  3. Character limit guard (500 chars)
 *  4. API call with typing indicator
 *
 * @param {SubmitEvent} event - The form submit event.
 * @returns {Promise<void>}
 */
const handleSubmit = async (event) => {
    event.preventDefault();

    if (isProcessing) return;

    const message = chatInput.value.trim();

    /* ── Guard: empty ── */
    if (!message) return;

    /* ── Guard: character limit ── */
    if (message.length > MAX_CHAR_COUNT) {
        showInputError(`Message is ${message.length - MAX_CHAR_COUNT} characters over the limit.`);
        return;
    }

    hideInputError();

    /* ── Render user message & reset input ── */
    appendMessage(message, 'user');
    chatInput.value = '';
    updateCharCount();

    /* ── Lock UI during API call ── */
    isProcessing = true;
    setInputDisabled(true);
    showTyping(true);
    setStatus('loading');

    /* ── Call Gemini API ── */
    const reply = await gemini.chat(message);

    /* ── Unlock UI & render response ── */
    showTyping(false);
    isProcessing = false;
    setInputDisabled(false);
    setStatus('connected');

    appendMessage(reply, 'ai');
    chatInput.focus();
};

// ─── Event Listeners ─────────────────────────────────────────

/* Chat */
chatForm.addEventListener('submit', handleSubmit);
chatInput.addEventListener('input', updateCharCount);

/* Settings modal */
settingsBtn.addEventListener('click', openSettings);
settingsCloseBtn.addEventListener('click', closeSettings);
settingsSaveBtn.addEventListener('click', saveSettings);

/* Close dialog on backdrop click */
settingsDialog.addEventListener('click', (e) => {
    if (e.target === settingsDialog) closeSettings();
});

/* Persona switching */
personaSelect.addEventListener('change', handlePersonaChange);

// ─── Initialization ──────────────────────────────────────────

(() => {
    console.info(
        '%c⚽ MatchDay Copilot initialized',
        'color: #00d4ff; font-weight: bold; font-size: 14px;'
    );

    if (!config.geminiApiKey) {
        console.info(
            '%c🔑 No API key found. Click the ⚙️ Settings gear to configure.',
            'color: #f5a623; font-size: 12px;'
        );
        setStatus('error');
    } else {
        setStatus('connected');
        console.info('%c✅ API key detected', 'color: #4ade80;');
    }

    /* Initialize character counter */
    updateCharCount();

    /* Render gate status from stadiumState */
    renderGateStatus();
})();
