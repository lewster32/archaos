/**
 * Ambient declarations for globals available in both
 * browser and Node.js runtimes. Avoids pulling in the
 * full DOM lib for the engine package.
 */

declare const console: {
    log(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
    debug(...args: unknown[]): void;
};

declare function setTimeout(
    callback: () => void,
    ms?: number,
): number;
