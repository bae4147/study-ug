# study-ug

Undergraduate reading study. **A clone of study2 (`reading-experiment-mba`)**
with a fixed paper, three arms, and rebuilt event recording. Everything not
listed under *What changed* is study2's code, byte for byte.

- **Live:** https://bae4147.github.io/study-ug/ (GitHub Pages, `main` → `/docs`)
- **Trial entry (no email):** https://bae4147.github.io/study-ug/dev.html — *delete before recruiting*
- **Firebase project:** `study-ug-osu` (Firestore + Cloud Functions; no Hosting)
- **Paper:** Häfner, Stock & Oberst (2014), *Decreasing students' stress through
  time management training* — `docs/papers/hafner2014/paper.pdf`
- **Media (temporary, from study1's mroz2018):** `audio.m4a`, `video.mp4`, `infographic.png` in the same folder

## Flow

```
landing → login (email link; name only) → pre-task → reading → post-task → post-study-survey → complete
```

`index.html` (upload) and `preparation.html` (generation) are gone. The session
document study2 created on upload is now created in `login.html` right after the
profile is saved.

## Conditions

Assigned in `login.html` by **permuted blocks of 3**: every 3 consecutive
participants cover each arm once, in a fresh random order.

| condition | right panel | chatbot |
|---|---|---|
| `no_ai` | none | — |
| `mm` | 4 tabs | study2 `controlSystemPrompt` (general assistant) |
| `mm_cimo` | 4 tabs | study2 `ebmCimoSystemPrompt` + parallel context-extraction call |

Tabs are study2's: 💬 AI Chatbot first, then 🎬 Video Overview / 👥 Podcast /
🗺️ Infographic shuffled per participant. The summary-text tab is removed.

## What changed from study2

| area | change |
|---|---|
| `login.html` | class dropdown removed (not collected); creates the session; 3-arm permuted blocks; redirects to `pre-task.html` |
| `reading.html` | fixed paper fetched from `papers/…/paper.pdf` into the existing renderer; static media; **paper shown as rendered page images instead of `<embed>`** (see below); study1's mp4 video tab; Pause button + veil; recorder wired in; `simplified` tab removed |
| `functions/` | trimmed to `chatCompletion`, `sendLoginEmail`, `sendCompletionEmail` + new `ingestEvents` (beacon) and `devLogin` (trial); Node 22 |
| all pages | Firebase config → `study-ug-osu`; function URLs → `us-central1-study-ug-osu.cloudfunctions.net` |
| `firestore.rules` | new; `eventBatches` are append-only |

### Why the paper is page images, not `<embed>`

study2 displayed uploaded PDFs in the browser's native viewer (`<embed>`). That
viewer is a separate document: scroll position, current page and section are
invisible to the page, so study2 recorded none of them for PDFs (only hover
enter/leave and wheel ticks). study2 *also* rendered every page to a PNG and
never used the result. `study-ug` displays those PNGs in a scrollable panel,
which makes `reading_scroll` (page, section, position) observable.

Cost: native text selection inside the PDF is lost. If it matters, a pdf.js
text layer can be added on top of the images later.

## Data — what is recorded and where

```
users/{uid}                       fullName, email, condition, createdAt, lastLoginAt
users/{uid}/sessions/{sid}        condition, paper, paperMetadata, beaconToken, currentPhase,
                                  reading: { startedAt, completedAt, totalDuration, focusTimes,
                                             classificationSummary, externalToolUsage,
                                             resourcesUsed, chatHistory }      ← study2's summary, minus events[]
                                  postTask / survey …                         ← study2 pages, unchanged
users/{uid}/sessions/{sid}/eventBatches/{batchId}   ← append-only, immutable
    batchSeq, writtenAt, final, viaBeacon
    points[]     { seq, t, sinceStart, type, phase, …payload }
    intervals[]  { seq, stream, state, start, end, duration, documentHidden? }
randomization/counter             { index, block[] }
```

**Point events** — every `logEvent()` call study2 already made is kept and now
persisted without a whitelist: `reading_started`, `reading_phase_complete`,
`finish_reading_*`, `focus_switch`, `resource_tab_switch`, `pdf_activity`,
`scroll_action`, `llm_activity` (typing / non-typing bursts),
`llm_question_asked`, `llm_answer_received` (+ CIMO context fields),
`audio_*` / `video_*` (`*_seeked` now carries `from`), `text_selection`,
`panel_resized`, `window_focus_change`. Added: `reading_start`, `reading_end`,
`reading_paused`, `reading_resumed`, `reading_scroll`, `panel_focus`,
`tab_click`, `window_activated` / `window_deactivated` (with `documentHidden`),
`window_closed_during_reading`.

**Interval streams** — closed spans written at the moment of the real event,
sharing one timestamp between the end of one span and the start of the next,
so each stream tiles its range with no gaps:

| stream | states | covers |
|---|---|---|
| `window` | activated / deactivated | whole session |
| `reading` | on / paused | whole session |
| `panel` | reading / ai / none | only while activated **and** on |

Flushed every 25 events or 10 s; on `pagehide` the remainder goes by
`sendBeacon` to `ingestEvents`, authenticated by the session's `beaconToken`.

Reassemble a session: read all `eventBatches`, sort by `batchSeq`, then by `seq`.

## Before recruiting

- [ ] Replace the temporary media in `docs/papers/hafner2014/`
- [ ] Edit participant-facing copy (pre-task / post-task / survey still read as the MBA study)
- [ ] Delete `docs/dev.html`, remove `devLogin` from `functions/index.js`, rotate `DEV_ACCESS_TOKEN`
- [ ] Delete test users (`tester-*@example.com`) under `users/` and `firebase firestore:delete randomization/counter`
- [ ] `admin.html` still reads `reading.events` — update it to `eventBatches`
- [ ] Send yourself a real sign-in email at `@osu.edu` and click through once

## Working on it

```bash
cd functions && npm install            # once
firebase deploy --only functions       # after editing functions/
git push                               # docs/ goes live on GitHub Pages in ~1 min
```

The end-to-end check lives outside the repo (Playwright, drives the live site
through all three arms); ask for it if you want it committed.
