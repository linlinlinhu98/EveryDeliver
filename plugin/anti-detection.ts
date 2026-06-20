/**
 * EveryDeliver — Anti-Detection Engine (Phase 3.6)
 *
 * Strategies:
 * 1. Request throttling per domain (max N/hour)
 * 2. Random delays between actions (jitter)
 * 3. Night pause (23:00–07:00 local time)
 * 4. Scroll simulation for lazy-loaded content
 * 5. Natural mouse-movement-like timing patterns
 *
 * All timings use randomization within configured bounds to avoid
 * pattern detection by the target platform's anti-bot systems.
 */

import { ANTI_DETECTION } from "./types";

// ============================================================
// Throttle Manager
// ============================================================

interface DomainState {
  count: number;
  resetAt: number;
}

const domainStates = new Map<string, DomainState>();

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Check if extraction is allowed for this domain.
 * Returns { allowed: boolean, reason?: string }
 */
export function checkThrottle(url: string): { allowed: boolean; reason?: string } {
  const domain = getDomain(url);

  // Night pause check
  const hour = new Date().getHours();
  if (
    hour >= ANTI_DETECTION.NIGHT_START_HOUR ||
    hour < ANTI_DETECTION.NIGHT_END_HOUR
  ) {
    return { allowed: false, reason: "night_pause" };
  }

  // Domain throttle check
  const now = Date.now();
  let state = domainStates.get(domain);

  if (!state || now >= state.resetAt) {
    state = { count: 0, resetAt: now + 3600_000 }; // 1 hour window
    domainStates.set(domain, state);
  }

  if (state.count >= ANTI_DETECTION.MAX_PER_HOUR) {
    return {
      allowed: false,
      reason: `hourly_limit: ${state.count}/${ANTI_DETECTION.MAX_PER_HOUR}`,
    };
  }

  state.count++;
  return { allowed: true };
}

/** Reset throttle for a domain (used after successful import) */
export function decrementThrottle(url: string): void {
  const domain = getDomain(url);
  const state = domainStates.get(domain);
  if (state && state.count > 0) state.count--;
}

// ============================================================
// Jitter / Random Delay
// ============================================================

/**
 * Returns a random delay in ms between min and max.
 * Uses a gamma-ish distribution: mostly near min, occasionally longer.
 */
export function randomDelay(minMs: number, maxMs: number): number {
  // Use two uniform randoms multiplied → skews toward lower values
  const u1 = Math.random();
  const u2 = Math.random();
  const skewed = Math.min(u1, u2) * (maxMs - minMs) + minMs;
  return Math.round(skewed);
}

/** Sleep for a random duration with jitter */
export function sleep(inputMs: number): Promise<void> {
  const jittered = inputMs + randomDelay(0, ANTI_DETECTION.JITTER_MS);
  return new Promise((resolve) => setTimeout(resolve, jittered));
}

// ============================================================
// Scroll Simulation
// ============================================================

/**
 * Slowly scroll down to trigger lazy-loaded content (e.g., full JD text).
 * Uses variable speed to appear more human-like.
 */
export async function simulateScroll(): Promise<void> {
  const totalHeight = document.body.scrollHeight;
  const viewportHeight = window.innerHeight;
  const steps = Math.ceil(totalHeight / (viewportHeight * 0.7));

  for (let i = 0; i < steps; i++) {
    const scrollTo = (i + 1) * viewportHeight * 0.7;
    const delay = randomDelay(200, 600);

    window.scrollTo({
      top: scrollTo,
      behavior: "smooth",
    });

    await new Promise((r) => setTimeout(r, delay));
  }

  // Scroll back to top
  window.scrollTo({ top: 0, behavior: "smooth" });
  await new Promise((r) => setTimeout(r, 500));
}

// ============================================================
// DOM Mutation Watcher (for SPA navigation)
// ============================================================

type PageChangeCallback = () => void;

/**
 * Watch for SPA page transitions (these sites are React/Vue SPAs).
 * When the DOM changes significantly (URL or main content area),
 * fires the callback so the content script can re-extract.
 */
export function watchPageChanges(callback: PageChangeCallback): MutationObserver {
  let lastUrl = window.location.href;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const observer = new MutationObserver(() => {
    // Debounce: only fire once after mutations settle
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        callback();
      }
    }, 1000);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
  });

  // Also watch for history API changes
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function (...args) {
    originalPushState(...args);
    setTimeout(callback, 500);
  };

  history.replaceState = function (...args) {
    originalReplaceState(...args);
    setTimeout(callback, 500);
  };

  window.addEventListener("popstate", () => {
    setTimeout(callback, 500);
  });

  return observer;
}

// ============================================================
// Visibility / Focus Detection
// ============================================================

/**
 * Pause extraction when tab is hidden to avoid looking like a bot
 * that operates while the user isn't watching.
 */
export function isTabVisible(): boolean {
  return document.visibilityState === "visible";
}

export function onVisibilityChange(callback: (visible: boolean) => void): () => void {
  const handler = () => callback(document.visibilityState === "visible");
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}
