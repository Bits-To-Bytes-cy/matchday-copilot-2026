/**
 * ============================================================
 *  MatchDay Copilot — Utilities
 * ============================================================
 *
 *  This module contains pure, side-effect-free helper functions
 *  extracted from app.js. They are isolated here so they can be
 *  unit tested without a full DOM or running app shell.
 *
 *  Note: escapeHtml and renderMarkdown call document.createElement
 *  internally to leverage the browser's native HTML entity encoding,
 *  but do not require a fully rendered document body.
 *
 *  @module utils
 */

/**
 * Sanitizes a string to prevent XSS when inserting into innerHTML.
 *
 * @param   {string} str - The raw string to sanitize.
 * @returns {string} The escaped, safe-to-render string.
 */
export const escapeHtml = (str) => {
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
export const renderMarkdown = (text) => {
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

/**
 * Maps traffic keywords in stadiumState values to visual styling.
 * Each level gets a distinct dot color and Tailwind text class.
 *
 * @param   {string} statusText - The raw status string from stadiumState.
 * @returns {{ dotColor: string, textClass: string, level: string }}
 */
export const getTrafficLevel = (statusText) => {
    const lower = statusText.toLowerCase();
    if (lower.includes('high'))     return { dotColor: 'bg-red-400',    textClass: 'text-red-400',    level: 'High' };
    if (lower.includes('moderate')) return { dotColor: 'bg-yellow-400', textClass: 'text-yellow-400', level: 'Moderate' };
    return                                 { dotColor: 'bg-green-400',  textClass: 'text-green-400',  level: 'Low' };
};

/**
 * Calculates the visual state and CSS classes for the character counter
 * based on the current length and maximum allowed length.
 *
 * @param   {number} length - Current number of characters.
 * @param   {number} max - Maximum allowed characters.
 * @returns {{ state: 'ok'|'warning'|'over', addClass: string, removeClasses: string[] }}
 */
export const getCharCountStyle = (length, max) => {
    if (length > max) {
        return {
            state: 'over',
            addClass: 'text-red-400',
            removeClasses: ['text-gray-600', 'text-accent-gold']
        };
    } else if (length > max * 0.9) {
        return {
            state: 'warning',
            addClass: 'text-accent-gold',
            removeClasses: ['text-gray-600', 'text-red-400']
        };
    } else {
        return {
            state: 'ok',
            addClass: 'text-gray-600',
            removeClasses: ['text-accent-gold', 'text-red-400']
        };
    }
};
