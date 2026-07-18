/**
 * ============================================================
 *  MatchDay Copilot — Gemini API Service
 * ============================================================
 *
 *  Encapsulates all communication with the Google Gemini API.
 *  Every public method:
 *    • Has full JSDoc annotations (@param, @returns, @throws).
 *    • Wraps async calls in try/catch.
 *    • Returns user-friendly error strings on failure.
 *
 *  The service prepends a stadium-assistant persona via
 *  Gemini's `systemInstruction` field on every request.
 *
 *  @module api
 */

import config from './config.js';

// ─── Constants ───────────────────────────────────────────────

/** @type {string} Gemini REST API endpoint for the specified model */
const GEMINI_ENDPOINT =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/** @type {number} Request timeout in milliseconds (15 s) */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * System-level persona injected into every Gemini request.
 * Ensures the model behaves as a stadium concierge, not a generic chatbot.
 *
 * @type {string}
 */
const SYSTEM_PERSONA = [
    'You are the MatchDay Copilot, the official AI assistant for the',
    'FIFA World Cup 2026 Smart Stadiums. Your goal is to assist fans,',
    'volunteers, and staff with stadium navigation, crowd management,',
    'accessibility services, and tournament policies. Keep answers',
    'concise, highly practical, and format them with clean spacing.',
    'Translate automatically if the user speaks a different language.',
].join(' ');

// ─── GeminiService Class ─────────────────────────────────────

/**
 * Service class for interacting with the Google Gemini API.
 *
 * @example
 *   const gemini = new GeminiService();
 *   const reply  = await gemini.chat('Where is Gate A?');
 */
export class GeminiService {

    /**
     * Creates a new GeminiService instance.
     *
     * @param {string} [apiKey] - Optional API key override.
     *                            Falls back to config.geminiApiKey.
     */
    constructor(apiKey = '') {
        /** @type {string} The API key used for authentication */
        this.apiKey = apiKey || config.geminiApiKey;

        /**
         * Multi-turn conversation history.
         * Each entry follows the Gemini `Content` schema.
         *
         * @type {Array<{role: string, parts: Array<{text: string}>}>}
         */
        this.history = [];
    }

    // ── Public Methods ───────────────────────────────────────

    /**
     * Sends a user message to Gemini and returns the model's response.
     *
     * The system persona is automatically prepended via the
     * `systemInstruction` field — it is NOT added to the history
     * array, keeping the conversation context clean.
     *
     * @param   {string}           prompt - The user's plain-text message.
     * @returns {Promise<string>}  The model's text reply, or a
     *                             user-friendly error string on failure.
     */
    async chat(prompt) {
        /* ── Guard: missing API key ── */
        if (!this.apiKey) {
            return '⚠️ No API key configured. Please set your Gemini API key first.\n\n'
                 + 'Open the browser console and run:\n'
                 + '```\nlocalStorage.setItem("matchday_copilot_gemini_api_key", "YOUR_KEY");\n```\n'
                 + 'Then refresh the page.';
        }

        /* ── Guard: empty prompt ── */
        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
            return '⚠️ Please enter a message before sending.';
        }

        try {
            /* ── Build user message & append to history ── */
            const userMessage = { role: 'user', parts: [{ text: prompt.trim() }] };
            this.history.push(userMessage);

            /* ── Call the Gemini API ── */
            const response = await this._sendRequest(this.history);

            /* ── Extract model text ── */
            const text = this._extractText(response);

            /* ── Append model reply to history for multi-turn ── */
            this.history.push({ role: 'model', parts: [{ text }] });

            /* ── Keep history within configured limits ── */
            this._trimHistory();

            return text;

        } catch (error) {
            /* ── Remove the failed user message from history ── */
            this.history.pop();
            return this._toUserError(error);
        }
    }

    /**
     * Resets the conversation history to start a fresh session.
     *
     * @returns {void}
     */
    resetHistory() {
        this.history = [];
    }

    /**
     * Tests connectivity with a lightweight ping prompt.
     *
     * @returns {Promise<boolean>} True if the API responds successfully.
     */
    async testConnection() {
        try {
            const result = await this.chat('Hello');
            return !result.startsWith('⚠️');
        } catch {
            return false;
        }
    }

    /**
     * Dynamically updates the API key at runtime.
     * Useful when the user provides a key through a settings UI.
     *
     * @param {string} newKey - The new API key to use.
     * @returns {void}
     */
    setApiKey(newKey) {
        this.apiKey = newKey;
    }

    // ── Private Methods ──────────────────────────────────────

    /**
     * Constructs and sends the POST request to the Gemini
     * `generateContent` endpoint.
     *
     * The request body includes:
     *  - `systemInstruction` — the stadium-assistant persona.
     *  - `contents`          — the full conversation history.
     *
     * An AbortController enforces a timeout to prevent hangs.
     *
     * @private
     * @param   {Array<{role: string, parts: Array<{text: string}>}>} contents
     *          The conversation history to send.
     * @returns {Promise<Object>} Parsed JSON response from the API.
     * @throws  {Error}           On network failure, timeout, or non-OK status.
     */
    async _sendRequest(contents) {
        const url = `${GEMINI_ENDPOINT}?key=${this.apiKey}`;

        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            const response = await fetch(url, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: {
                        parts: [{ text: SYSTEM_PERSONA }],
                    },
                    contents,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`API ${response.status}: ${errorBody}`);
            }

            return await response.json();

        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Extracts the plain-text response from a Gemini API result.
     *
     * @private
     * @param   {Object} response - The raw JSON response from Gemini.
     * @returns {string} The extracted text content.
     * @throws  {Error}  If the response structure is unexpected or empty.
     */
    _extractText(response) {
        const candidates = response?.candidates;

        if (!candidates || candidates.length === 0) {
            throw new Error('No candidates returned by the model.');
        }

        const text = candidates[0]?.content?.parts?.[0]?.text;

        if (typeof text !== 'string') {
            throw new Error('Unexpected response format — no text part found.');
        }

        return text;
    }

    /**
     * Converts a caught error into a user-friendly message string.
     * Never leaks raw stack traces or API internals to the user.
     *
     * @private
     * @param   {Error}  error - The original error object.
     * @returns {string} A sanitized, human-readable error message.
     */
    _toUserError(error) {
        if (error.name === 'AbortError') {
            return '⏳ The request timed out. Please check your connection and try again.';
        }

        if (error.message?.includes('400')) {
            return '❌ Bad request. The message may be too long or contain unsupported content.';
        }

        if (error.message?.includes('401') || error.message?.includes('403')) {
            return '🔑 Authentication failed. Please verify your API key in the console.';
        }

        if (error.message?.includes('429')) {
            return '🚦 Rate limit exceeded. Please wait a moment and try again.';
        }

        if (error.message?.includes('500') || error.message?.includes('503')) {
            return '🔧 The Gemini service is temporarily unavailable. Please try again shortly.';
        }

        if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
            return '🌐 Network error. Please check your internet connection.';
        }

        // Generic fallback
        return '❌ Something went wrong. Please try again shortly.';
    }

    /**
     * Trims conversation history to the configured maximum,
     * always retaining the most recent messages.
     *
     * @private
     * @returns {void}
     */
    _trimHistory() {
        const maxEntries = config.maxChatHistory * 2; // user + model pairs
        if (this.history.length > maxEntries) {
            this.history = this.history.slice(-maxEntries);
        }
    }
}

export default GeminiService;
