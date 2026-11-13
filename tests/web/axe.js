// Runs axe-core on a rendered container and returns readable violations. jsdom does not compute layout or colour, so
// the colour-contrast rule is disabled here; contrast is checked against the design tokens and in the browser.
import axe from 'axe-core';

export async function accessibilityViolations(container) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return results.violations.map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length})`);
}
