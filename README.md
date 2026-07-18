# MatchDay Copilot — FIFA World Cup 2026 Smart Stadium Assistant

> **An AI-powered stadium companion** that delivers real-time navigation, crowd intelligence, accessibility services, and tournament policy guidance to fans, volunteers, and staff — all from a single, secure chat interface.

---

## Chosen Vertical

**Smart Stadiums & Tournament Operations**

MatchDay Copilot targets the operational backbone of a FIFA World Cup 2026 venue. Rather than building another match-score tracker, we focus on the **in-stadium experience** — the moment a fan steps through the gate and needs to find their seat, locate accessible facilities, understand bag policies, or navigate food courts during a halftime surge. The copilot acts as a **multilingual, context-aware concierge** that scales to every connected device in the venue without requiring a native app install.

---

## Architecture & Approach

### Vanilla ES6 Module Architecture

The entire application is built with **pure ES6 JavaScript modules** — no React, no Node.js backend, no build step, no bundler. This is a deliberate architectural choice, not a limitation:

| Constraint | Our Approach | Benefit |
|---|---|---|
| No framework overhead | Native `<script type="module">` imports | Zero dependency risk, instant load |
| No build pipeline | Browser-native ES6 module resolution | No `node_modules`, no `package.json` bloat |
| No server runtime | Client-side Gemini REST API calls | Fully static hosting (GitHub Pages, CDN) |
| Repo size < 10 MB | **~27 KB total** (99.7% under budget) | Fast clones, minimal CI overhead |

### Module Dependency Graph

```
index.html
  └── src/app.js          (UI orchestration, event wiring)
        ├── src/config.js  (secure runtime configuration)
        └── src/api.js     (GeminiService — API communication)
```

Every module has a **single responsibility** with no circular dependencies. The dependency flow is strictly **unidirectional**: `app.js` → `api.js` → `config.js`.

### Why gemini-2.5-flash

We selected **`gemini-2.5-flash`** as our model for three reasons:

1. **Low Latency** — Stadium environments demand sub-second perceived response times. Fans standing in crowded concourses will not wait 5+ seconds for directions. The `flash` variant is optimized for speed-first generation, making it ideal for concise, practical Q&A.

2. **Cost Efficiency** — A World Cup venue may serve 80,000+ concurrent fans. The `flash` tier provides the lowest per-token cost in the Gemini family, enabling sustainable scaling without budget blowouts during peak match hours.

3. **Sufficient Reasoning** — Our use case (navigation, policy lookup, accessibility guidance) does not require deep multi-step reasoning. The `flash` model's capability is more than adequate for extracting structured answers from a well-crafted system instruction.

### Repository Footprint

```
challenge 4/
├── .gitignore       561 B
├── README.md        (this file)
├── index.html    14,135 B
└── src/
    ├── config.js  3,132 B
    ├── api.js     7,312 B
    └── app.js     7,845 B
                  ─────────
           Total:  ~33 KB   (0.003% of the 10 MB limit)
```

**Zero external dependencies** are committed to the repository. Tailwind CSS is loaded via CDN at runtime, ensuring the repo contains only our authored source code.

---

## Core Logic

### Multi-Turn Conversation with Error Recovery

The `GeminiService` class maintains a **stateful conversation history** (`this.history`) that accumulates `user` and `model` message pairs. This enables Gemini to reference earlier context in the conversation — critical for follow-up questions like:

> *"Where is the nearest restroom?"*
> *"Is it wheelchair accessible?"*

The second question only makes sense if the model remembers the first answer.

**Error Recovery Strategy:** If an API call fails (network timeout, rate limit, auth error), the service **pops the failed user message from history** before returning the error string. This prevents a corrupted message from poisoning all subsequent multi-turn requests:

```javascript
catch (error) {
    this.history.pop();           // Remove the failed user message
    return this._toUserError(error); // Return human-readable error
}
```

Without this rollback, a single network hiccup would leave an orphaned user message in the history array, causing the Gemini API to expect a model response that never came — breaking every subsequent call.

### System Instruction Configuration

Rather than prepending persona text into the user's message (which wastes tokens and pollutes conversation history), we use Gemini's **dedicated `systemInstruction` field**:

```javascript
body: JSON.stringify({
    systemInstruction: {
        parts: [{ text: SYSTEM_PERSONA }],
    },
    contents: this.history,
}),
```

This approach ensures the persona is:
- **Applied consistently** on every request without manual concatenation.
- **Excluded from token counting** toward the conversation context window.
- **Immutable** — the persona cannot be overridden by user prompt injection attempts.

The persona instructs the model to behave as a stadium concierge with automatic language detection and translation, concise formatting, and a focus on practical, actionable answers.

### Secure Runtime Configuration

**No API keys, tokens, or secrets exist anywhere in the source code.** The `config.js` module reads all sensitive values from `localStorage` at initialization:

```javascript
const config = Object.freeze({
    geminiApiKey: readFromStorage('gemini_api_key', ''),
    mapsApiKey:   readFromStorage('maps_api_key',   ''),
    // ...
});
```

Security properties:
- **`Object.freeze()`** — The config object is immutable after creation. No runtime code can modify or extend it.
- **Namespaced keys** — All `localStorage` keys are prefixed with `matchday_copilot_` to avoid collisions with other applications on the same origin.
- **Graceful degradation** — If `localStorage` is unavailable (private browsing, restrictive CSP), the module falls back to empty defaults without throwing.
- **`.gitignore` enforcement** — `.env` files are blocked at the version control level, preventing accidental secret commits.

---

## Accessibility Design

Accessibility is not a bolt-on feature — it is **woven into the structural HTML** from the first line of code. Our approach targets **WCAG 2.1 AA** compliance.

### ARIA Live Regions

The chat interface uses two distinct ARIA live strategies:

| Element | ARIA Attribute | Purpose |
|---|---|---|
| `#chat-messages` | `role="log"`, `aria-live="polite"` | Screen readers announce new messages without interrupting the current reading flow |
| `#typing-indicator` | `role="status"`, `aria-live="polite"` | Announces "Assistant is typing a response" when the indicator appears |
| Status badge | `role="status"`, `aria-live="polite"` | Announces connection state changes (Connected / Error / Sending) |

The `polite` assertiveness level ensures announcements **queue behind** the user's current screen reader output, preventing jarring interruptions during message composition.

### Keyboard Navigation & Focus Management

- **Skip-to-content link** — The first focusable element on the page is a visually hidden "Skip to main content" link that becomes visible on `:focus`, allowing keyboard users to bypass the header.
- **`:focus-visible` ring** — All interactive elements display a **2px cyan outline** (`#00d4ff`) on keyboard focus, with a 2px offset to prevent visual collision with element borders. This ring does **not** appear on mouse click, avoiding unnecessary visual noise.
- **Focus restoration** — After an AI response renders, focus is programmatically returned to the chat input field, enabling continuous keyboard-only conversation without manual tabbing.
- **Form submission** — The chat input is wrapped in a `<form>`, so pressing **Enter** naturally submits without requiring a separate keyboard event listener.

### Semantic HTML Structure

```
<body>
  ├── <a>           Skip navigation link
  ├── <header>      Banner landmark (role="banner")
  ├── <main>        Primary content (role="main")
  │   ├── <section> Chat panel (aria-label="AI Chat Assistant")
  │   └── <section> Map panel (aria-label="Stadium Map")
  └── <footer>      Content info (role="contentinfo")
```

Every `<section>` carries a descriptive `aria-label`. Every decorative SVG icon carries `aria-hidden="true"`. Every chat bubble is marked with `role="article"` and an `aria-label` identifying the sender.

---

## Assumptions Made

1. **Unified Stadium Zone Model** — We assume all FIFA 2026 venues follow a standardized zone-naming convention (e.g., Gate A–H, Zone 100–400, Concourse Level 1–3). The AI persona is instructed to reference these generic designations. In a production deployment, venue-specific maps and zone data would be injected via the system instruction or a grounding data source.

2. **Mobile-First Web Access** — End-users are assumed to access MatchDay Copilot through a **standard mobile browser** (Chrome, Safari, Firefox) on a 4G/5G stadium network. No native app install is required. The responsive grid layout adapts from single-column (mobile) to a 3:2 split (desktop).

3. **Client-Side API Calls Are Acceptable** — For this hackathon prototype, API keys are stored in `localStorage` and Gemini calls are made directly from the browser. In a production environment, these calls would be proxied through a lightweight backend (e.g., Cloud Functions) to enforce rate limiting, key rotation, and audit logging.

4. **English as Default, Multilingual by Instruction** — The UI chrome is in English, but the AI persona is instructed to **automatically detect and respond in the user's language**. This covers the multilingual reality of a World Cup audience without requiring a dedicated i18n framework.

5. **No Offline Support Required** — Stadium venues are assumed to provide reliable Wi-Fi/cellular connectivity. The application does not implement service workers or offline caching. If connectivity drops, the error handling pipeline returns a clear "Network error" message to the user.

6. **Single-Session Context** — Conversation history is maintained **in-memory only** for the current browser session. Refreshing the page starts a new conversation. This is intentional — stadium interactions are ephemeral by nature ("Where is my seat?", "What time does the next match start?") and do not benefit from persistent history.

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Structure** | Semantic HTML5 | Accessible, SEO-friendly, zero overhead |
| **Styling** | Tailwind CSS (CDN) | Rapid utility-first styling, no local build |
| **Logic** | Vanilla ES6 Modules | Native browser support, no transpilation |
| **AI Model** | Gemini 2.5 Flash | Low-latency, cost-efficient generation |
| **Config** | localStorage | Client-side secret storage, no backend |
| **Hosting** | Static (any CDN) | GitHub Pages, Firebase Hosting, Vercel |

---

## Quick Start

```bash
# 1. Clone the repository
git clone <repo-url> && cd matchday-copilot

# 2. Set your Gemini API key (browser console)
localStorage.setItem("matchday_copilot_gemini_api_key", "YOUR_GEMINI_KEY");

# 3. Serve locally (any static server)
python -m http.server 8080
# or
npx serve .

# 4. Open in browser
open http://localhost:8080
```

No `npm install`. No build step. No environment variables. Just serve and go.

---

## Repository Structure

```
.
├── .gitignore          # Blocks .env, node_modules, OS/IDE artifacts
├── README.md           # This document
├── index.html          # Semantic HTML5 shell with ARIA landmarks
└── src/
    ├── config.js       # Frozen config from localStorage (no hardcoded secrets)
    ├── api.js          # GeminiService class with multi-turn error recovery
    └── app.js          # UI orchestration, chat rendering, event wiring
```

---

## License

Built for the **Google Gemini API Developer Competition 2025** — FIFA World Cup 2026 Smart Stadium Challenge.

---

<p align="center">
  <strong>⚽ MatchDay Copilot</strong> — Because every fan deserves a personal stadium guide.
</p>
