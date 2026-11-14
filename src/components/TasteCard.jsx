// The taste profile on Settings (ADR 0010): what the Machina has learnt the person likes, read from taste.json in the
// data folder, or how to make one, or what is wrong with it. Read-only: the profile is made from tracks in a chat with
// Claude, or written by hand (docs/TASTE.md).
import { stepPicture } from '../../shared/taste.js';
import { instrumentOf } from '../../shared/instruments.js';
import { useTaste } from '../hooks/useTaste.js';

const HOW_TO = 'docs/TASTE.md in the BPMachina folder explains how to make one from a folder of tracks you love.';

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
function TasteSummary({ profile }) {
  const { tempo, keys, groove, bass, acid, instruments, structure, likes, avoid, source } = profile;
  return (
    <>
      <p className="taste-name">{profile.name}</p>
      <p className="note-text">
        {source
          ? `From ${source.tracks} tracks, ${source.method === 'hand' ? 'written by hand' : `made in ${source.method}`}. `
          : ''}
        {profile.updated ? `Updated ${profile.updated}.` : ''}
      </p>
      <dl className="taste-facts">
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

export function TasteCard() {
  const { taste, error } = useTaste();
  return (
    <section className="card card-pad ai-key" aria-labelledby="taste-title">
      <h2 className="section-title" id="taste-title">
        Your taste
      </h2>
      <p className="view-sub">
        A taste profile tells the Machina what you like: tempo, keys, groove, bass, instruments, structure and
        transitions, learnt from tracks you love. Tick “Compose to my taste” on the Machina screen to use it. It is the
        file taste.json in BPMachina’s data folder, on this computer; your music is never uploaded to make it.
      </p>
      {taste === null && !error ? <p className="note-text">Checking…</p> : null}
      {error ? (
        <p className="error-banner" role="alert">
          {error}
        </p>
      ) : null}
      {taste?.status === 'none' ? <p className="view-sub">No taste profile yet. {HOW_TO}</p> : null}
      {taste?.status === 'invalid' ? (
        <div className="error-banner" role="alert">
          <p>The taste profile could not be used. Fix taste.json, or make it again:</p>
          <ul>
            {taste.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {taste?.status === 'ok' ? <TasteSummary profile={taste.profile} /> : null}
    </section>
  );
}
