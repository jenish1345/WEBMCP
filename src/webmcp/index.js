/**
 * WebMCP Main Entry & Browser Polyfill Bootstrap
 * Conforming to W3C Web Machine Learning CG Draft Specification
 */

import ModelContext from './model-context.js';
import security from './security.js';

export default {
  ModelContext,
  initWebMCP,
  security
};

export { ModelContext, security };

/**
 * Initializes and installs WebMCP onto the provided document and window environment.
 * If native document.modelContext exists (e.g. Chrome with WebMCP flag), it preserves native or wraps it.
 *
 * @param {Document} [doc]
 * @param {Window} [win]
 * @returns {ModelContext} The active ModelContext instance
 */
export function initWebMCP(doc, win) {
  const targetDoc = doc || (typeof document !== 'undefined' ? document : null);
  const targetWin = win || (typeof window !== 'undefined' ? window : null);

  if (!targetDoc) {
    return new ModelContext();
  }

  if (!targetDoc.modelContext) {
    const context = new ModelContext(targetDoc);
    targetDoc.modelContext = context;

    if (targetWin?.navigator && !targetWin.navigator.modelContext) {
      targetWin.navigator.modelContext = context;
    }
  }

  return targetDoc.modelContext;
}

// Auto-initialize if running in standard browser context
if (typeof document !== 'undefined') {
  initWebMCP();
}
