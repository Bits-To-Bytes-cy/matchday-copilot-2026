/**
 * ============================================================
 *  MatchDay Copilot — Configuration Module
 * ============================================================
 *
 *  Provides a secure, centralized configuration object.
 *
 *  RESOLUTION ORDER:
 *    1. localStorage  (runtime overrides set by the user)
 *    2. Defaults       (safe fallbacks — never contains secrets)
 *
 *  SECURITY:
 *    - No API keys are ever hardcoded in source.
 *    - Keys are stored in localStorage only on the client device.
 *    - The exported config object is frozen to prevent tampering.
 *
 *  @module config
 */

// ─── Private Constants ───────────────────────────────────────

/** @type {string} localStorage namespace to avoid key collisions */
const STORAGE_PREFIX = 'matchday_copilot_';

// ─── Helper Functions ────────────────────────────────────────

/**
 * Reads a single configuration value from localStorage.
 *
 * @param   {string}  key          - The config key (without prefix).
 * @param   {string}  fallback     - Default value if not found.
 * @returns {string}  The resolved configuration value.
 */
const readFromStorage = (key, fallback = '') => {
    try {
        const value = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
        return value !== null ? value : fallback;
    } catch {
        // localStorage may be unavailable (private browsing, SSR, etc.)
        return fallback;
    }
};

/**
 * Writes a single configuration value to localStorage.
 *
 * @param   {string}  key    - The config key (without prefix).
 * @param   {string}  value  - The value to persist.
 * @returns {boolean} True if the write succeeded, false otherwise.
 */
export const saveToStorage = (key, value) => {
    try {
        localStorage.setItem(`${STORAGE_PREFIX}${key}`, value);
        return true;
    } catch {
        console.warn(`[Config] Unable to persist "${key}" to localStorage.`);
        return false;
    }
};

// ─── Configuration Object ────────────────────────────────────

/**
 * @typedef  {Object}  AppConfig
 * @property {string}  geminiApiKey    - Gemini API key (user-provided at runtime).
 * @property {string}  mapsApiKey      - Google Maps API key (user-provided at runtime).
 * @property {string}  geminiModel     - Gemini model identifier to use.
 * @property {string}  defaultStadium  - Default stadium code for map centering.
 * @property {number}  maxChatHistory  - Maximum chat messages retained in memory.
 */

/** @type {AppConfig} */
const config = Object.freeze({
    geminiApiKey:   readFromStorage('gemini_api_key',   ''),
    mapsApiKey:     readFromStorage('maps_api_key',     ''),
    geminiModel:    readFromStorage('gemini_model',     'gemini-2.5-flash'),
    defaultStadium: readFromStorage('default_stadium',  'metlife'),
    maxChatHistory: Number(readFromStorage('max_chat_history', '50')),
});

export default config;
