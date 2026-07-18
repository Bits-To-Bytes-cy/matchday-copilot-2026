/**
 * ============================================================
 *  MatchDay Copilot — Gemini API Service
 * ============================================================
 *  @module api
 */

import config from './config.js';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Service class for interacting with the Google Gemini API.
 * @example
 *   const gemini = new GeminiService();
 *   const reply  = await gemini.chat('Where is Gate A?');
 */
export class GeminiService {
    /**
     * @param {string} [apiKey] - Optional API key override.
     * @param {string} [model]  - Optional model override.
     */
    constructor(apiKey = '', model = '') {
        this.apiKey  = apiKey || config.geminiApiKey;
        this.model   = model  || config.geminiModel;
        /** @type {Array<{role: string, parts: Array<{text: string}>}>} */
        this.history = [];
    }

    /**
     * Sends a prompt to Gemini and returns the response text.
     * @param   {string}           prompt - The user's plain-text prompt.
     * @returns {Promise<string>}  Model response or user-friendly error.
     */
    async chat(prompt) {
        if (!this.apiKey) {
            return '\u26a0\ufe0f No API key configured. Add your Gemini key in Settings.';
        }
        if (!prompt?.trim()) {
            return '\u26a0\ufe0f Please enter a message before sending.';
        }
        try {
            const msg = { role: 'user', parts: [{ text: prompt.trim() }] };
            this.history.push(msg);
            const res  = await this._sendRequest(this.history);
            const text = this._extractText(res);
            this.history.push({ role: 'model', parts: [{ text }] });
            this._trimHistory();
            return text;
        } catch (err) {
            return this._toUserError(err);
        }
    }

    /** Resets conversation history. @returns {void} */
    resetHistory() { this.history = []; }

    /**
     * Tests API connectivity.
     * @returns {Promise<boolean>} True if the API responds.
     */
    async testConnection() {
        try {
            const r = await this.chat('Hello');
            return !r.startsWith('\u26a0');
        } catch { return false; }
    }

    /**
     * @private
     * @param   {Array} contents - Conversation contents.
     * @returns {Promise<Object>} Parsed JSON response.
     */
    async _sendRequest(contents) {
        const url = `${GEMINI_BASE_URL}/${this.model}:generateContent?key=${this.apiKey}`;
        const ctrl = new AbortController();
        const tid  = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents }),
                signal: ctrl.signal,
            });
            if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
            return await res.json();
        } finally { clearTimeout(tid); }
    }

    /**
     * @private
     * @param   {Object} response - Raw Gemini response.
     * @returns {string} Extracted text.
     */
    _extractText(response) {
        const text = response?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof text !== 'string') throw new Error('Unexpected response format.');
        return text;
    }

    /**
     * @private
     * @param   {Error}  error - The caught error.
     * @returns {string} User-friendly error message.
     */
    _toUserError(error) {
        if (error.name === 'AbortError') return '\u23f3 Request timed out. Check your connection.';
        if (error.message?.includes('401') || error.message?.includes('403'))
            return '\ud83d\udd11 Auth failed. Verify your API key.';
        if (error.message?.includes('429'))
            return '\ud83d\udea6 Rate limited. Wait a moment and retry.';
        if (error.message?.includes('Failed to fetch'))
            return '\ud83c\udf10 Network error. Check your internet.';
        return '\u274c Something went wrong. Please try again.';
    }

    /** @private @returns {void} */
    _trimHistory() {
        const max = config.maxChatHistory * 2;
        if (this.history.length > max) this.history = this.history.slice(-max);
    }
}

export default GeminiService;
