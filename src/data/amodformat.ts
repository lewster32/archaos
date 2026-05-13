/**
 * Thrown by .amod decode/validate paths. Wrap any underlying JSON
 * parse / decompression error via the optional cause argument.
 */
export class AmodFormatError extends Error {
    public readonly cause?: unknown;
    constructor(message: string, cause?: unknown) {
        super(message);
        this.name = "AmodFormatError";
        this.cause = cause;
    }
}
