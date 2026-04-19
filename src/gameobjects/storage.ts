/**
 * Gated localStorage wrapper. All reads/writes go through this module so that
 * storage access can be disabled when the user declines the consent prompt.
 *
 * Consent state is persisted in a cookie (`storageConsent=accepted|declined`)
 * so it survives both localStorage being unavailable and cross-session reloads.
 */

type ConsentState = "accepted" | "declined" | "unknown";

let _consent: ConsentState = "unknown";

const COOKIE_NAME = "storageConsent";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

function getCookie(name: string): string | null {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string): void {
    document.cookie = `${name}=${encodeURIComponent(value)};max-age=${COOKIE_MAX_AGE};path=/;SameSite=Lax`;
}

/** Read the persisted consent cookie on startup.
 *  Auto-accepts when running inside Tauri (standalone desktop build). */
export function loadConsent(): ConsentState {
    // Standalone desktop app — no cookie banner needed.
    if ("__TAURI_INTERNALS__" in globalThis) {
        _consent = "accepted";
        return _consent;
    }
    const raw = getCookie(COOKIE_NAME);
    if (raw === "accepted" || raw === "declined") {
        _consent = raw;
    }
    return _consent;
}

/** Current consent state. */
export function getConsent(): ConsentState {
    return _consent;
}

/** Whether the user has already answered the consent prompt. */
export function hasAnswered(): boolean {
    return _consent !== "unknown";
}

/** Accept storage consent — enables localStorage and persists via cookie. */
export function acceptConsent(): void {
    _consent = "accepted";
    setCookie(COOKIE_NAME, "accepted");
}

/** Decline storage consent — disables localStorage and persists via cookie. */
export function declineConsent(): void {
    _consent = "declined";
    setCookie(COOKIE_NAME, "declined");
}

export function getItem(key: string): string | null {
    if (_consent !== "accepted") {
        return null;
    }
    try {
        return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
        return null;
    }
}

export function setItem(key: string, value: string): void {
    if (_consent !== "accepted") {
        return;
    }
    try {
        globalThis.localStorage?.setItem(key, value);
    } catch {
        // Silently ignore — quota exceeded, private browsing, etc.
    }
}

export function removeItem(key: string): void {
    if (_consent !== "accepted") {
        return;
    }
    try {
        globalThis.localStorage?.removeItem(key);
    } catch {
        // Silently ignore
    }
}
