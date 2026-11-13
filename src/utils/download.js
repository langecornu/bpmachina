// Saves data as a file through the browser's download, without a server round trip.
import { slugify } from './slugify.js';

/**
 * @param {unknown} data
 * @param {string} name a readable name; it is turned into a safe file name
 * @param {string} suffix for example ".cue.json"
 */
export function downloadJson(data, name, suffix) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugify(name) || 'song'}${suffix}`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
