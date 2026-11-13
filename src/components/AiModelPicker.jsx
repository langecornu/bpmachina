// Which Claude model the Machina runs on, each with what it is good for and roughly what this composition would cost
// on it. A real radio group, so it works from the keyboard and with a screen reader.
import { AI_MODELS, estimateCost, formatPriceRange } from '../../shared/aiModels.js';

/**
 * @param {{ value: string, onChange: (modelId: string) => void,
 *   request: Parameters<typeof estimateCost>[0], disabled?: boolean }} props
 */
export function AiModelPicker({ value, onChange, request, disabled = false }) {
  return (
    <fieldset className="ai-models" disabled={disabled}>
      <legend>Model</legend>
      {AI_MODELS.map((model) => (
        <label key={model.id} className="ai-model" data-selected={value === model.id || undefined}>
          <input
            type="radio"
            name="ai-model"
            value={model.id}
            checked={value === model.id}
            onChange={() => onChange(model.id)}
          />
          <span className="ai-model-name">{model.name}</span>
          <span className="ai-model-summary">{model.summary}</span>
          <span className="ai-model-cost">{formatPriceRange(estimateCost(request, model.id))}</span>
        </label>
      ))}
      <p className="note-text ai-models-note">
        Rough estimates at Anthropic list prices, for about {request.tracks} tracks and {request.patternBars} bars of
        patterns to write. Billed to your API key.
      </p>
    </fieldset>
  );
}
