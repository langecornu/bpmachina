// The Claude models the AI composer can use, their list prices, and a rough estimate of what a composition costs
// before it runs. Most of the cost is the answer: every note is written out, and the model reasons before it writes.
// The estimate counts the notes a song of that size usually has, and is shown as a range. Pure, for browser and server.

/**
 * @typedef {{ id: string, name: string, summary: string, inputPerMillion: number, outputPerMillion: number,
 *   hasFallback: boolean }} AiModel prices in US dollars per million tokens, Anthropic list prices; `hasFallback`:
 *   a request the model declines is retried on another model
 */

/** @type {AiModel[]} cheapest first */
export const AI_MODELS = [
  {
    id: 'claude-haiku-5-5',
    name: 'Haiku 5.5',
    summary: 'Fastest and cheapest. Good for sketches and quick variations.',
    inputPerMillion: 0.1,
    outputPerMillion: 0.5,
    hasFallback: false,
  },
  {
    id: 'claude-sonnet-5-5',
    name: 'Sonnet 5.5',
    summary: 'Balanced: strong ideas at half the price of Opus.',
    inputPerMillion: 2,
    outputPerMillion: 10,
    hasFallback: true,
  },
  {
    id: 'claude-opus-5-5',
    name: 'Opus 5.5',
    summary: 'The most musical and careful, for the track that matters.',
    inputPerMillion: 4,
    outputPerMillion: 20,
    hasFallback: true,
  },
];

export const DEFAULT_AI_MODEL = 'claude-opus-5-5';
export const AI_MODEL_IDS = /** @type {[string, ...string[]]} */ (AI_MODELS.map((model) => model.id));

/** Tokens one written note takes in the answer: `{"track":"Bass","step":12,"length":2,"pitch":45,"velocity":100}`. */
const TOKENS_PER_NOTE = 24;
/** Notes a track plays per bar, on average across drums, bass, chords and melody. */
const NOTES_PER_TRACK_BAR = 5;

/** @param {string} id @returns {AiModel} the model, or the default one for an unknown id */
export function aiModel(id) {
  const fallback = /** @type {AiModel} */ (AI_MODELS.find((model) => model.id === DEFAULT_AI_MODEL));
  return AI_MODELS.find((model) => model.id === id) ?? fallback;
}

/**
 * What tokens cost on a model, in US dollars.
 * @param {{ inputTokens: number, outputTokens: number }} usage
 * @param {string} modelId
 * @returns {number}
 */
export function costOf(usage, modelId) {
  const model = aiModel(modelId);
  return (usage.inputTokens * model.inputPerMillion + usage.outputTokens * model.outputPerMillion) / 1_000_000;
}

/**
 * Roughly how many tokens a composition uses.
 * @param {{ tracks: number, patternBars: number, existingNotes?: number }} request `patternBars`: the bars of all the
 *   patterns written (not the song's length: a repeated pattern is written once); `existingNotes`: notes sent along
 *   for a revision
 * @returns {{ inputTokens: number, outputTokens: [number, number] }} output as a likely range
 */
export function estimateTokens({ tracks, patternBars, existingNotes = 0 }) {
  const inputTokens = Math.round(1800 + existingNotes * 14);
  const written = 300 + Math.max(1, tracks) * Math.max(1, patternBars) * NOTES_PER_TRACK_BAR * TOKENS_PER_NOTE;
  // Reasoning before writing comes on top: the whole answer is about one and a half to two and a half times what is
  // written.
  return { inputTokens, outputTokens: [Math.round(written * 1.5), Math.round(written * 2.5)] };
}

/**
 * Roughly what a composition costs on a model, in US dollars.
 * @param {Parameters<typeof estimateTokens>[0]} request
 * @param {string} modelId
 * @returns {[number, number]} likely range
 */
export function estimateCost(request, modelId) {
  const { inputTokens, outputTokens } = estimateTokens(request);
  return [
    costOf({ inputTokens, outputTokens: outputTokens[0] }, modelId),
    costOf({ inputTokens, outputTokens: outputTokens[1] }, modelId),
  ];
}

/**
 * A price for people: cents under a dollar, rounded sensibly.
 * @param {number} dollars
 * @returns {string}
 */
export function formatPrice(dollars) {
  if (dollars < 0.01) {
    return 'under 1¢';
  }
  if (dollars < 1) {
    return `${Math.round(dollars * 100)}¢`;
  }
  return `$${dollars.toFixed(2)}`;
}

/**
 * A cost range for people: "3¢ to 5¢", or one figure when both ends round the same.
 * @param {[number, number]} range
 * @returns {string}
 */
export function formatPriceRange([low, high]) {
  const from = formatPrice(low);
  const to = formatPrice(high);
  if (high < 0.01) {
    return from;
  }
  if (low < 0.01) {
    return `up to ${to}`;
  }
  return from === to ? `about ${from}` : `about ${from} to ${to}`;
}
