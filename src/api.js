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

/** @type {string} Base URL for the Gemini REST API (model appended dynamically) */
const GEMINI_BASE_URL =
    'https://generativelanguage.googleapis.com/v1beta/models';

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

/**
 * Real-time in-memory stadium state representing live gate traffic.
 * In production, this would be fed by IoT sensors / venue APIs.
 *
 * @type {Object<string, string>}
 */
export const stadiumState = {
    gateA: 'High Traffic (85% capacity) - Expect 20 min delays. Divert to Gate C.',
    gateB: 'Moderate Traffic (40% capacity) - Normal operations.',
    gateC: 'Low Traffic (15% capacity) - Recommended entry point.',
};

/**
 * Persona-specific instruction extensions.
 * Appended to the base persona based on the active mode.
 *
 * @type {Object<string, string>}
 */
const PERSONA_EXTENSIONS = {
    fan: [
        'You are speaking to a fan. Use a warm, friendly, and encouraging tone.',
        'Give simple directions with landmarks ("near the big screen", "past the food court").',
        'Suggest nearby amenities, fun facts, and fan experience tips.',
    ].join(' '),
    staff: [
        'You are speaking to a staff member or volunteer. Use a professional, operational tone.',
        'Include zone codes (e.g., Z-100, C-3), radio channel references, and capacity percentages.',
        'Prioritize crowd safety, incident protocols, and operational efficiency.',
    ].join(' '),
};

// ─── GeminiService Class ─────────────────────────────────────

/**
 * Service class for interacting with the Google Gemini API.
 *
 * @example
 *   const gemini = new GeminiService();
 *   const reply  = await gemini.chat('Where is Gate A?');
 *   // Or use the strict variant:
 *   const reply2 = await gemini.sendMessage('Where is Gate A?');
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
         * Active persona mode — determines the AI's tone and detail level.
         * @type {'fan'|'staff'}
         */
        this.persona = 'fan';

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
     * Sends a message to Gemini with strict input validation.
     *
     * Unlike `chat()`, this method **throws** on invalid input
     * rather than returning a soft error string. This makes it
     * suitable for programmatic use and automated testing.
     *
     * @param   {string}           message - The user's plain-text message.
     * @returns {Promise<string>}  The model's text reply.
     * @throws  {Error}            If the message is empty or not a string.
     * @throws  {Error}            If the API key is missing.
     */
    async sendMessage(message) {
        /* ── Guard: empty or invalid message ── */
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            throw new Error('Message content cannot be empty');
        }

        /* ── Guard: missing API key ── */
        if (!this.apiKey) {
            throw new Error('API key is not configured');
        }

        /* ── Delegate to the core chat pipeline ── */
        return await this.chat(message);
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

    /**
     * Switches the active persona mode.
     * Clears conversation history since the AI's behavior changes.
     *
     * @param {'fan'|'staff'} mode - The new persona mode.
     * @returns {void}
     */
    setPersona(mode) {
        if (mode !== this.persona && (mode === 'fan' || mode === 'staff')) {
            this.persona = mode;
            this.resetHistory();
        }
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
        const model = config.geminiModel || 'gemini-2.5-flash';
        const url   = `${GEMINI_BASE_URL}/${model}:generateContent?key=${this.apiKey}`;

        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            const response = await fetch(url, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: {
                        parts: [{ text: this._buildSystemInstruction() }],
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
     * Builds the full system instruction by combining:
     *  1. The base MatchDay Copilot persona.
     *  2. Live stadium gate traffic data.
     *  3. The active persona extension (Fan or Staff).
     *
     * @private
     * @returns {string} The complete system instruction string.
     */
    _buildSystemInstruction() {
        const gateStatus = Object.entries(stadiumState)
            .map(([gate, status]) => `${gate}: ${status}`)
            .join(' | ');

        return [
            SYSTEM_PERSONA,
            '',
            '--- REAL-TIME STADIUM STATE ---',
            `Check the real-time stadium state for gate traffic before answering navigation questions: ${gateStatus}`,
            '',
            '--- ACTIVE PERSONA ---',
            PERSONA_EXTENSIONS[this.persona] || PERSONA_EXTENSIONS.fan,
        ].join('\n');
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
     * Trims conversation history to optimize memory efficiency.
     *
     * Enforces a hard cap of **10 messages** (5 user-model pairs)
     * to minimize payload size on subsequent API calls. In a
     * stadium environment with 80,000+ concurrent users, keeping
     * the conversation context lean reduces per-request latency.
     *
     * @private
     * @constant {number} MAX_HISTORY_LENGTH - Hard cap of 10 messages.
     * @returns  {void}
     */
    _trimHistory() {
        const MAX_HISTORY_LENGTH = 10;
        if (this.history.length > MAX_HISTORY_LENGTH) {
            this.history = this.history.slice(-MAX_HISTORY_LENGTH);
        }
    }
}

export default GeminiService;
