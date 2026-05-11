/**
 * Derive a URL/filename-safe slug from a display name.
 *
 * - Lowercases the input.
 * - Normalises accented characters to their base form.
 * - Strips punctuation that isn't a word character, whitespace, or hyphen.
 * - Collapses runs of whitespace into single hyphens.
 * - Collapses runs of hyphens into a single hyphen.
 * - Trims leading/trailing hyphens.
 *
 * Returns an empty string when the input contains no slug-worthy
 * characters - the caller (the editor) treats an empty id as "not
 * saveable".
 */
export function slugify(name: string): string {
    return name
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}
