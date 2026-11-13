// Turns free text into a short, file-name-safe slug.

/**
 * @param {string} text
 * @returns {string} lower-case letters, digits and single dashes, at most 50 characters
 */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}
