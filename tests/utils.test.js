/**
 * ============================================================
 *  MatchDay Copilot — Utils Unit Tests
 * ============================================================
 *
 *  Zero-dependency test suite using the native Node.js test runner.
 *  Run with: node --test tests/utils.test.js
 *
 *  @module tests/utils
 */

import test from 'node:test';
import assert from 'node:assert';

// ─── Mock document for Node.js environment ──────────────────

class StubElement {
    constructor() {
        this._textContent = '';
    }
    set textContent(val) {
        this._textContent = val;
    }
    get textContent() {
        return this._textContent;
    }
    get innerHTML() {
        return String(this._textContent)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

globalThis.document = {
    createElement: () => new StubElement()
};

// ─── Import after mocks are established ─────────────────────

const { escapeHtml, renderMarkdown, getTrafficLevel, getCharCountStyle } = await import('../src/utils.js');

// ═════════════════════════════════════════════════════════════
//  TEST 1: escapeHtml
// ═════════════════════════════════════════════════════════════

test('escapeHtml: sanitizes unsafe strings', async (t) => {
    await t.test('escapes <script> tags', () => {
        const input = '<script>alert(1)</script>';
        const result = escapeHtml(input);
        assert.strictEqual(result.includes('<script>'), false);
        assert.ok(result.includes('&lt;script&gt;'));
    });

    await t.test('escapes ampersands', () => {
        const input = 'Fish & Chips';
        const result = escapeHtml(input);
        assert.strictEqual(result, 'Fish &amp; Chips');
    });

    await t.test('leaves plain text unchanged', () => {
        const input = 'Hello World 123!';
        const result = escapeHtml(input);
        assert.strictEqual(result, 'Hello World 123!');
    });

    await t.test('escapes quote characters in attribute breakouts', () => {
        const input = '"><img src=x onerror=alert(1)>';
        const result = escapeHtml(input);
        assert.ok(result.includes('&quot;&gt;'));
    });
});

// ═════════════════════════════════════════════════════════════
//  TEST 2: renderMarkdown
// ═════════════════════════════════════════════════════════════

test('renderMarkdown: converts markdown to HTML safely', async (t) => {
    await t.test('renders bold text', () => {
        const result = renderMarkdown('This is **bold** text');
        assert.ok(result.includes('<strong>bold</strong>') || result.includes('strong class="text-white font-semibold">bold</strong>'));
    });

    await t.test('renders italic text', () => {
        const result = renderMarkdown('This is *italic* text');
        assert.ok(result.includes('<em>italic</em>'));
    });

    await t.test('renders inline code', () => {
        const result = renderMarkdown('Use the `const` keyword');
        assert.ok(result.includes('<code class="bg-stadium-dark'));
        assert.ok(result.includes('>const</code>'));
    });

    await t.test('renders code blocks', () => {
        const result = renderMarkdown('```\nlet x = 1;\n```');
        assert.ok(result.includes('<pre class="bg-stadium-dark'));
        assert.ok(result.includes('<code><br>let x = 1;<br></code>'));
    });

    await t.test('converts newlines to <br>', () => {
        const result = renderMarkdown('Line 1\nLine 2');
        assert.ok(result.includes('Line 1<br>Line 2'));
    });

    await t.test('XSS safety: escapes raw <script> inside markdown', () => {
        const result = renderMarkdown('**<script>alert(1)</script>**');
        assert.strictEqual(result.includes('<script>'), false);
        assert.ok(result.includes('&lt;script&gt;'));
        assert.ok(result.includes('<strong'));
    });
});

// ═════════════════════════════════════════════════════════════
//  TEST 3: getTrafficLevel
// ═════════════════════════════════════════════════════════════

test('getTrafficLevel: classifies status strings', async (t) => {
    await t.test('classifies "High Traffic..." as High/red', () => {
        const result = getTrafficLevel('High Traffic (85% capacity)');
        assert.strictEqual(result.level, 'High');
        assert.strictEqual(result.dotColor, 'bg-red-400');
        assert.strictEqual(result.textClass, 'text-red-400');
    });

    await t.test('classifies "Moderate Traffic..." as Moderate/yellow', () => {
        const result = getTrafficLevel('Moderate Traffic (40% capacity)');
        assert.strictEqual(result.level, 'Moderate');
        assert.strictEqual(result.dotColor, 'bg-yellow-400');
        assert.strictEqual(result.textClass, 'text-yellow-400');
    });

    await t.test('classifies "Low Traffic..." as Low/green', () => {
        const result = getTrafficLevel('Low Traffic (15% capacity)');
        assert.strictEqual(result.level, 'Low');
        assert.strictEqual(result.dotColor, 'bg-green-400');
        assert.strictEqual(result.textClass, 'text-green-400');
    });

    await t.test('matching is case-insensitive (all-caps HIGH)', () => {
        const result = getTrafficLevel('EXPECT HIGH DELAYS');
        assert.strictEqual(result.level, 'High');
    });

    await t.test('defaults to Low when no keyword matches', () => {
        const result = getTrafficLevel('Normal operations without any specific keyword');
        assert.strictEqual(result.level, 'Low');
        assert.strictEqual(result.dotColor, 'bg-green-400');
    });
});

// ═════════════════════════════════════════════════════════════
//  TEST 4: getCharCountStyle
// ═════════════════════════════════════════════════════════════

test('getCharCountStyle: calculates character counter visual state', async (t) => {
    await t.test('returns ok when well under the limit (50/500)', () => {
        const result = getCharCountStyle(50, 500);
        assert.strictEqual(result.state, 'ok');
        assert.strictEqual(result.addClass, 'text-gray-600');
        assert.ok(result.removeClasses.includes('text-accent-gold'));
        assert.ok(result.removeClasses.includes('text-red-400'));
    });

    await t.test('returns warning when just above 90% (460/500)', () => {
        const result = getCharCountStyle(460, 500);
        assert.strictEqual(result.state, 'warning');
        assert.strictEqual(result.addClass, 'text-accent-gold');
        assert.ok(result.removeClasses.includes('text-gray-600'));
        assert.ok(result.removeClasses.includes('text-red-400'));
    });

    await t.test('returns ok at exactly the 90% boundary (450/500)', () => {
        const result = getCharCountStyle(450, 500);
        assert.strictEqual(result.state, 'ok', 'Exactly 90% must not trigger warning');
        assert.strictEqual(result.addClass, 'text-gray-600');
    });

    await t.test('returns over when exceeding the limit (501/500)', () => {
        const result = getCharCountStyle(501, 500);
        assert.strictEqual(result.state, 'over');
        assert.strictEqual(result.addClass, 'text-red-400');
        assert.ok(result.removeClasses.includes('text-gray-600'));
        assert.ok(result.removeClasses.includes('text-accent-gold'));
    });

    await t.test('returns ok for zero-length input', () => {
        const result = getCharCountStyle(0, 500);
        assert.strictEqual(result.state, 'ok');
    });
});
