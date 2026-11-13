// Keyboard helpers: the app's shortcuts must not fire while someone is typing in a field.

/**
 * @param {EventTarget | null} target
 * @returns {boolean} true for a text field, a select or editable text
 */
export function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
