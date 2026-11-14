// What one taste profile says (ADR 0012), readably: its labels, how it was made, and the music it describes, with the
// kick and bass steps drawn as a bar. Rows the profile leaves out are not shown.
import { instrumentOf } from '../../shared/instruments.js';
import { intensityLabel, stepPicture } from '../../shared/taste.js';

/** @param {{ label: string, children: import('react').ReactNode }} props */
function Row({ label, children }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

/** @param {{ profile: import('../../shared/types.js').TasteProfile }} props */
export function TasteSummary({ profile }) {
  const { tempo, keys, groove, bass, acid, instruments, structure, likes, avoid, source } = profile;
  const method = source?.method === 'hand' ? 'written by hand' : `made in ${source?.method}`;
  return (
    <>
      <p className="note-text">
        {source ? `From ${source.tracks} tracks, ${method}. ` : ''}
        {profile.updated ? `Updated ${profile.updated}.` : ''}
      </p>
      <dl className="taste-facts">
        <Row label="Style">{profile.style}</Row>
        {profile.moods?.length ? <Row label="Moods">{profile.moods.join(', ')}</Row> : null}
        {profile.intensity === undefined ? null : (
          <Row label="Intensity">
            {intensityLabel(profile.intensity)} ({profile.intensity})
          </Row>
        )}
        {profile.genres?.length ? (
          <Row label="Genres">{profile.genres.map((genre) => `${genre.name} ${genre.share}%`).join(', ')}</Row>
        ) : null}
        {tempo ? (
          <Row label="Tempo">
            {tempo.min}–{tempo.max} BPM{tempo.typical ? `, usually ${tempo.typical}` : ''}
          </Row>
        ) : null}
        {keys?.roots?.length || keys?.scales?.length ? (
          <Row label="Keys">{[keys.roots?.join(', '), keys.scales?.join(' or ')].filter(Boolean).join(' · ')}</Row>
        ) : null}
        {groove?.kickSteps ? (
          <Row label="Kick">
            <code className="taste-steps">{stepPicture(groove.kickSteps)}</code>
          </Row>
        ) : null}
        {bass ? (
          <Row label="Bass">
            {bass.steps ? <code className="taste-steps">{stepPicture(bass.steps)}</code> : null} {bass.style ?? ''}
          </Row>
        ) : null}
        {acid ? (
          <Row label="Acid">
            {[
              acid.presence,
              acid.accentsPerBar === undefined ? '' : `${acid.accentsPerBar} accents a bar`,
              acid.slidesPerBar === undefined ? '' : `${acid.slidesPerBar} slides a bar`,
            ]
              .filter(Boolean)
              .join(', ')}
          </Row>
        ) : null}
        {instruments?.length ? (
          <Row label="Band">
            {instruments.map((item) => `${instrumentOf(item.instrument).name} (${item.presence})`).join(', ')}
          </Row>
        ) : null}
        {structure?.sections?.length ? (
          <Row label="Structure">
            {structure.sections.map((section) => `${section.kind} ${section.bars}`).join(' → ')} bars
          </Row>
        ) : null}
        {likes?.length ? <Row label="Likes">{likes.join('; ')}</Row> : null}
        {avoid?.length ? <Row label="Avoid">{avoid.join('; ')}</Row> : null}
      </dl>
    </>
  );
}
