# WEBMCP — Web Accessibility Engine

[![License](https://img.shields.io/badge/license-MPL--2.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/npm/v/axe-core.svg)](https://www.npmjs.com/package/axe-core)
[![Node](https://img.shields.io/badge/node-%3E%3D4-brightgreen.svg)](package.json)

A powerful accessibility testing engine for websites and HTML-based user interfaces — fast, lightweight, and built to drop into any test environment without friction.

> Built and maintained by **Antony Jenish Fernando J** ([@jenish1345](https://github.com/jenish1345))
>
> Based on [axe-core](https://github.com/dequelabs/axe-core) by Deque Systems, distributed under the [Mozilla Public License 2.0](LICENSE).

---

## What it does

WEBMCP lets you run automated accessibility checks against any web page or component. It covers WCAG 2.0, 2.1, and 2.2 at levels A, AA, and AAA, plus a collection of best-practice rules — all without manual effort.

On average it catches **57% of WCAG issues automatically**. Where it can't be certain, it flags elements as incomplete so you know exactly where manual review is needed.

---

## Getting started

Install the package:

```bash
npm install axe-core --save-dev
# or
pnpm add --save-dev axe-core
```

Include the script in your test fixture:

```html
<script src="node_modules/axe-core/axe.min.js"></script>
```

Run a check:

```js
axe.run().then(results => {
  if (results.violations.length) {
    throw new Error('Accessibility violations found');
  }
});
```

---

## Accessibility Rules

Rules are grouped by WCAG level and best practices. The full list is in [doc/rule-descriptions.md](./doc/rule-descriptions.md).

Rule types:
- **WCAG 2.0 / 2.1 / 2.2** — A, AA, and AAA conformance checks
- **Best practices** — common patterns like `h1` presence and ARIA gotchas

---

## Supported Browsers

| Browser | Support |
|---|---|
| Chrome 42+ | ✅ Full |
| Firefox 38+ | ✅ Full |
| Safari 7+ | ✅ Full |
| Edge 40+ | ✅ Full |
| IE 11 | ⚠️ Deprecated |

---

## Localization

Build for a specific language:

```bash
pnpm run build -- --lang=nl
```

Create a new translation:

```bash
pnpm run translate -- --lang=<langcode>
```

Supported locales include Basque, Chinese (Simplified/Traditional), Danish, Dutch, French, German, Greek, Hebrew, Italian, Japanese, Korean, Norwegian, Polish, Portuguese (Brazilian), Spanish, and Swedish.

You can also apply a locale at runtime:

```js
axe.configure({
  locale: {
    lang: 'de',
    checks: {
      abstractrole: {
        fail: 'Abstrakte ARIA-Rollen dürfen nicht direkt verwendet werden.'
      }
    }
  }
});
```

---

## Project Structure

```
lib/          Core engine source
rules/        Accessibility rule definitions
checks/       Individual check implementations
standards/    ARIA/HTML standards data
locales/      Translation files
doc/          API and developer documentation
test/         Unit and integration tests
```

---

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm run build

# Run tests
pnpm test

# Lint & format
pnpm run eslint
pnpm run fmt
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [doc/developer-guide.md](doc/developer-guide.md) for full contribution guidelines.

---

## API Reference

Full API documentation is in [doc/API.md](doc/API.md). TypeScript types are in [axe.d.ts](axe.d.ts).

---

## License

This project is distributed under the **[Mozilla Public License 2.0](LICENSE)**.

It includes third-party dependencies — see [LICENSE-3RD-PARTY.txt](LICENSE-3RD-PARTY.txt) for their individual terms.

This repository is a personal fork of [dequelabs/axe-core](https://github.com/dequelabs/axe-core). DEQUE, DEQUELABS, AXE®, and AXE-CORE® are trademarks of [Deque Systems, Inc](https://www.deque.com/legal/trademarks/).
