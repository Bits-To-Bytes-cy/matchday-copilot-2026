/**
 * ============================================================
 *  MatchDay Copilot — API Unit Tests
 * ============================================================
 *
 *  Zero-dependency test suite using the native Node.js test runner.
 *  Run with: node --test tests/api.test.js
 *
 *  Tests cover:
 *    1. Input validation  — chat() rejects empty strings
 *    2. History trimming  — _trimHistory() caps at 10 messages
 *    3. Error mapping     — _toUserError() produces user-friendly strings
 *
 *  @module tests/api
 */

import test from 'node:test';
import assert from 'node:assert';

// ─── Mock localStorage for Node.js environment ──────────────

globalThis.localStorage = {
    _store: {},
    getItem(key) {
        if (key === 'matchday_copilot_gemini_api_key') return 'mock-test-key';
        return this._store[key] ?? null;
    },
    setItem(key, value) { this._store[key] = String(value); },
    removeItem(key) { delete this._store[key]; },
    clear() { this._store = {}; },
};

// ─── Import after mocks are established ─────────────────────

const { GeminiService } = await import('../src/api.js');

// ═════════════════════════════════════════════════════════════
//  TEST 1: Input Validation — chat() rejects empty strings
// ═════════════════════════════════════════════════════════════

test('Input Validation: chat() rejects empty strings', async (t) => {

    await t.test('returns warning string for empty string input', async () => {
        const service = new GeminiService('mock-key');
        const result = await service.chat('');
        assert.ok(
            result.includes('Please enter a message'),
            `Expected warning message, got: "${result}"`
        );
    });

    await t.test('returns warning string for whitespace-only input', async () => {
        const service = new GeminiService('mock-key');
        const result = await service.chat('   ');
        assert.ok(
            result.includes('Please enter a message'),
            `Expected warning message, got: "${result}"`
        );
    });

    await t.test('returns warning string for null input', async () => {
        const service = new GeminiService('mock-key');
        const result = await service.chat(null);
        assert.ok(
            result.includes('Please enter a message'),
            `Expected warning message, got: "${result}"`
        );
    });

    await t.test('returns warning string for undefined input', async () => {
        const service = new GeminiService('mock-key');
        const result = await service.chat(undefined);
        assert.ok(
            result.includes('Please enter a message'),
            `Expected warning message, got: "${result}"`
        );
    });

    await t.test('sendMessage() throws Error for empty string', async () => {
        const service = new GeminiService('mock-key');
        await assert.rejects(
            async () => { await service.sendMessage(''); },
            /Message content cannot be empty/
        );
    });
});

// ═════════════════════════════════════════════════════════════
//  TEST 2: History Trimming — _trimHistory() caps at 10
// ═════════════════════════════════════════════════════════════

test('History Trimming: _trimHistory() removes oldest messages', async (t) => {

    await t.test('does not trim when history is at or below 10 messages', () => {
        const service = new GeminiService('mock-key');

        // Fill exactly 10 messages (5 user + 5 model pairs)
        for (let i = 0; i < 5; i++) {
            service.history.push({ role: 'user',  parts: [{ text: `msg-${i}` }] });
            service.history.push({ role: 'model', parts: [{ text: `reply-${i}` }] });
        }

        assert.strictEqual(service.history.length, 10);
        service._trimHistory();
        assert.strictEqual(service.history.length, 10, 'Should not trim at exactly 10');
    });

    await t.test('trims to 10 when history exceeds the limit', () => {
        const service = new GeminiService('mock-key');

        // Fill 14 messages (7 pairs)
        for (let i = 0; i < 7; i++) {
            service.history.push({ role: 'user',  parts: [{ text: `msg-${i}` }] });
            service.history.push({ role: 'model', parts: [{ text: `reply-${i}` }] });
        }

        assert.strictEqual(service.history.length, 14);
        service._trimHistory();
        assert.strictEqual(service.history.length, 10, 'Should trim to 10');
    });

    await t.test('retains the most recent messages after trimming', () => {
        const service = new GeminiService('mock-key');

        // Fill 12 messages
        for (let i = 0; i < 6; i++) {
            service.history.push({ role: 'user',  parts: [{ text: `msg-${i}` }] });
            service.history.push({ role: 'model', parts: [{ text: `reply-${i}` }] });
        }

        service._trimHistory();

        // The oldest 2 messages (msg-0, reply-0) should be gone
        const firstRemaining = service.history[0].parts[0].text;
        assert.strictEqual(
            firstRemaining, 'msg-1',
            `Expected oldest remaining to be "msg-1", got "${firstRemaining}"`
        );

        // The newest message should still be the last one
        const lastRemaining = service.history[service.history.length - 1].parts[0].text;
        assert.strictEqual(
            lastRemaining, 'reply-5',
            `Expected newest to be "reply-5", got "${lastRemaining}"`
        );
    });
});

// ═════════════════════════════════════════════════════════════
//  TEST 3: Error Mapping — _toUserError() returns friendly strings
// ═════════════════════════════════════════════════════════════

test('Error Mapping: _toUserError() maps status codes correctly', async (t) => {

    await t.test('maps 429 to rate-limit message', () => {
        const service = new GeminiService('mock-key');
        const result = service._toUserError(new Error('API 429: Too Many Requests'));
        assert.ok(
            result.toLowerCase().includes('rate limit'),
            `Expected "rate limit" in message, got: "${result}"`
        );
    });

    await t.test('maps 500 to server-unavailable message', () => {
        const service = new GeminiService('mock-key');
        const result = service._toUserError(new Error('API 500: Internal Server Error'));
        assert.ok(
            result.toLowerCase().includes('unavailable') || result.toLowerCase().includes('server'),
            `Expected server error message, got: "${result}"`
        );
    });

    await t.test('maps 503 to server-unavailable message', () => {
        const service = new GeminiService('mock-key');
        const result = service._toUserError(new Error('API 503: Service Unavailable'));
        assert.ok(
            result.toLowerCase().includes('unavailable') || result.toLowerCase().includes('server'),
            `Expected server error message, got: "${result}"`
        );
    });

    await t.test('maps 401 to auth-failure message', () => {
        const service = new GeminiService('mock-key');
        const result = service._toUserError(new Error('API 401: Unauthorized'));
        assert.ok(
            result.toLowerCase().includes('auth') || result.toLowerCase().includes('api key'),
            `Expected auth error message, got: "${result}"`
        );
    });

    await t.test('maps AbortError to timeout message', () => {
        const service = new GeminiService('mock-key');
        const abortError = new Error('The operation was aborted');
        abortError.name = 'AbortError';
        const result = service._toUserError(abortError);
        assert.ok(
            result.toLowerCase().includes('timed out') || result.toLowerCase().includes('timeout'),
            `Expected timeout message, got: "${result}"`
        );
    });

    await t.test('maps unknown errors to generic fallback', () => {
        const service = new GeminiService('mock-key');
        const result = service._toUserError(new Error('Something unexpected'));
        assert.ok(
            result.toLowerCase().includes('something went wrong') || result.toLowerCase().includes('try again'),
            `Expected generic fallback, got: "${result}"`
        );
    });
});
