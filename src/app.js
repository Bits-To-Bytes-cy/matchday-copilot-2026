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
 *    • Typing indicator lifecycle
 *    • Keyboard accessibility (Enter to send)
 *    • Basic markdown rendering for AI responses
 *
 *  @module app
 */

import config from './config.js';
import { GeminiService } from './api.js';

// ─── DOM References ──────────────────────────────────────────

/** @type {HTMLFormElement}   */ const chatForm        = document.getElementById('chat-form');
/** @type {HTMLInputElement}  */ const chatInput       = document.getElementById('chat-input');
/** @type {HTMLButtonElement} */ const sendBtn         = document.getElementById('send-btn');
/** @type {HTMLDivElement}    */ const chatMessages    = document.getElementById('chat-messages');
/** @type {HTMLDivElement}    */ const typingIndicator = document.getElementById('typing-indicator');
/** @type {HTMLSpanElement}   */ const statusDot       = document.getElementById('status-dot');
/** @type {HTMLSpanElement}   */ const statusText      = document.getElementById('status-text');

// ─── Service Instance ────────────────────────────────────────

/** @type {GeminiService} */
const gemini = new GeminiService();

// ─── State ───────────────────────────────────────────────────

/** @type {boolean} Prevents duplicate submissions while awaiting a response */
let isProcessing = false;

// ─── Utility Functions ───────────────────────────────────────

/**
 * Sanitizes a string to prevent XSS when inserting into innerHTML.
 * Escapes all HTML-significant characters.
 *
 * @param   {string} str - The raw string to sanitize.
 * @returns {string} The escaped, safe-to-render string.
 */
const escapeHtml = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
};

/**
 * Converts basic markdown formatting into safe HTML for display.
 * Supports: **bold**, *italic*, `inline code`, ```code blocks```,
 * and newline-to-<br> conversion.
 *
 * @param   {string} text - Raw text potentially containing markdown.
 * @returns {string} HTML string safe for innerHTML insertion.
 */
const renderMarkdown = (text) => {
    let html = escapeHtml(text);

    // Code blocks: ```...``` → <pre><code>...</code></pre>
    html = html.replace(/```([\s\S]*?)```/g, '<pre class="bg-stadium-dark rounded-lg p-3 my-2 text-xs overflow-x-auto"><code>$1</code></pre>');

    // Inline code: `...` → <code>...</code>
    html = html.replace(/`([^`]+)`/g, '<code class="bg-stadium-dark px-1.5 py-0.5 rounded text-accent-cyan text-xs">$1</code>');

    // Bold: **...** → <strong>...</strong>
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');

    // Italic: *...* → <em>...</em>
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Newlines → <br>
    html = html.replace(/\n/g, '<br>');

    return html;
};

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
        // User messages: plain escaped text (no markdown)
        bubble.textContent = text;
        wrapper.classList.add('flex-row-reverse');
    } else {
        // AI messages: render markdown formatting
        bubble.innerHTML = renderMarkdown(text);
    }

    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
    chatMessages.appendChild(wrapper);

    /* ── Smooth scroll to latest message ── */
    chatMessages.scrollTo({
        top: chatMessages.scrollHeight,
        behavior: 'smooth',
    });
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
        /* Scroll to show the indicator */
        chatMessages.scrollTo({
            top: chatMessages.scrollHeight,
            behavior: 'smooth',
        });
    }
};

/**
 * Toggles the interactive state of the chat input and send button.
 * Prevents duplicate submissions while the API is processing.
 *
 * @param {boolean} disabled - True to disable, false to re-enable.
 * @returns {void}
 */
const setInputDisabled = (disabled) => {
    chatInput.disabled = disabled;
    sendBtn.disabled   = disabled;
    sendBtn.setAttribute('aria-disabled', String(disabled));

    if (disabled) {
        chatInput.setAttribute('placeholder', 'Waiting for response...');
    } else {
        chatInput.setAttribute('placeholder', 'Ask about the stadium, matches, food...');
    }
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

    statusDot.className  = `w-2 h-2 rounded-full ${dot}`;
    statusText.textContent = text;
};

// ─── Event Handlers ──────────────────────────────────────────

/**
 * Handles chat form submission: validates input, renders the user
 * message, calls GeminiService, and displays the AI response.
 *
 * Guards against double-submission with the `isProcessing` flag.
 *
 * @param {SubmitEvent} event - The form submit event.
 * @returns {Promise<void>}
 */
const handleSubmit = async (event) => {
    event.preventDefault();

    /* ── Guard: prevent double-submission ── */
    if (isProcessing) return;

    const message = chatInput.value.trim();
    if (!message) return;

    /* ── Render user message & reset input ── */
    appendMessage(message, 'user');
    chatInput.value = '';

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

    /* ── Return focus to input for next message ── */
    chatInput.focus();
};

// ─── Event Listeners ─────────────────────────────────────────

chatForm.addEventListener('submit', handleSubmit);

// ─── Initialization ──────────────────────────────────────────

/**
 * Self-invoking initialization routine.
 * Logs startup state and warns if no API key is configured.
 */
(() => {
    console.info(
        '%c⚽ MatchDay Copilot initialized',
        'color: #00d4ff; font-weight: bold; font-size: 14px;'
    );

    if (!config.geminiApiKey) {
        console.info(
            '%c🔑 No API key found. Run in console:\n'
            + '   localStorage.setItem("matchday_copilot_gemini_api_key", "YOUR_KEY");\n'
            + '   Then refresh the page.',
            'color: #f5a623; font-size: 12px;'
        );
        setStatus('error');
    } else {
        setStatus('connected');
        console.info('%c✅ API key detected', 'color: #4ade80;');
    }
})();
