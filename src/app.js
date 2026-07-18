/**
 * ============================================================
 *  MatchDay Copilot — Application Entry Point
 * ============================================================
 *
 *  Initializes the UI, wires DOM events, and orchestrates
 *  the chat experience between the user and GeminiService.
 *
 *  @module app
 */

import config from './config.js';
import { GeminiService } from './api.js';

// ─── DOM References ──────────────────────────────────────────

/** @type {HTMLFormElement}  */ const chatForm      = document.getElementById('chat-form');
/** @type {HTMLInputElement} */ const chatInput     = document.getElementById('chat-input');
/** @type {HTMLDivElement}   */ const chatMessages  = document.getElementById('chat-messages');
/** @type {HTMLDivElement}   */ const typingIndicator = document.getElementById('typing-indicator');

// ─── Service Instance ────────────────────────────────────────

/** @type {GeminiService} */
const gemini = new GeminiService();

// ─── Chat Functions ──────────────────────────────────────────

/**
 * Appends a chat bubble to the messages container.
 *
 * @param {string}  text   - The message text to display.
 * @param {'user'|'ai'} sender - Who sent the message.
 * @returns {void}
 */
const appendMessage = (text, sender) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-bubble flex gap-3 items-start';

    const isUser = sender === 'user';

    // Avatar
    const avatar = document.createElement('div');
    avatar.className = `w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white ${
        isUser
            ? 'bg-gradient-to-br from-accent-gold to-orange-500 order-last'
            : 'bg-gradient-to-br from-accent-cyan to-accent-magenta'
    }`;
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = isUser ? 'You' : 'AI';

    // Bubble
    const bubble = document.createElement('div');
    bubble.className = `rounded-2xl px-4 py-3 max-w-[85%] text-sm leading-relaxed ${
        isUser
            ? 'bg-accent-cyan/10 text-accent-cyan rounded-tr-sm ml-auto'
            : 'bg-stadium-light text-gray-200 rounded-tl-sm'
    }`;
    bubble.textContent = text;

    if (isUser) {
        wrapper.classList.add('flex-row-reverse');
    }

    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
    chatMessages.appendChild(wrapper);

    // Auto-scroll to latest message
    chatMessages.scrollTop = chatMessages.scrollHeight;
};

/**
 * Shows or hides the typing indicator.
 *
 * @param {boolean} visible - Whether the indicator should be visible.
 * @returns {void}
 */
const showTyping = (visible) => {
    typingIndicator.classList.toggle('hidden', !visible);
    if (visible) {
        typingIndicator.setAttribute('aria-label', 'Assistant is typing');
    }
};

/**
 * Handles chat form submission: sends the user's message
 * to GeminiService and displays the response.
 *
 * @param {SubmitEvent} event - The form submit event.
 * @returns {Promise<void>}
 */
const handleSubmit = async (event) => {
    event.preventDefault();

    const message = chatInput.value.trim();
    if (!message) return;

    // Display user message & clear input
    appendMessage(message, 'user');
    chatInput.value = '';
    chatInput.focus();

    // Show typing indicator while waiting for AI
    showTyping(true);

    const reply = await gemini.chat(message);

    showTyping(false);
    appendMessage(reply, 'ai');
};

// ─── Event Listeners ─────────────────────────────────────────

chatForm.addEventListener('submit', handleSubmit);

// ─── Initialization Log ──────────────────────────────────────

console.info(
    '%c⚽ MatchDay Copilot initialized',
    'color: #00d4ff; font-weight: bold; font-size: 14px;'
);

if (!config.geminiApiKey) {
    console.info(
        '%c🔑 No API key found. Use: localStorage.setItem("matchday_copilot_gemini_api_key", "YOUR_KEY")',
        'color: #f5a623;'
    );
}
