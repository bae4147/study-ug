# study-ug

Undergraduate reading study. **A clone of study2 (`reading-experiment-mba`)**
with a fixed paper, three arms, and rebuilt event recording. Everything not
listed under *What changed* is study2's code, byte for byte.

- **Live:** https://bae4147.github.io/study-ug/ (GitHub Pages, `main` → `/docs`)
- **Trial entry (no email):** https://bae4147.github.io/study-ug/dev.html — *delete before recruiting*
- **Firebase project:** `study-ug-osu` (Firestore + Cloud Functions; no Hosting)
- **Paper:** Häfner, Stock & Oberst (2014), *Decreasing students' stress through
  time management training* — `docs/papers/hafner2014/paper.pdf`
- **Media:** `audio.m4a` (1:32), `video.mp4` (7:12), `infographic.png` (1536×2752) in the same folder, all on this paper

## Flow

```
index → login (email link) → consent → instructions → reading-instructions
       → reading → survey → post-task (CIMO reflection) → quiz → survey2 → complete
```

`index.html` is the entry point (it is what the root URL serves). It checks the
sign-in state: whoever is not signed in goes to `login.html`, and whoever is
signed in with an unfinished session is sent back to the page that session's
`currentPhase` names, so that reopening the link does not mint a second session.

Sign-in comes first so that consent is recorded against a known participant.
The two instruction pages are static: `instructions.html` describes the whole
assignment, `reading-instructions.html` only the reading session (and names the
GenAI tools only in the `mm` / `mm_cimo` arms).

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
| `login.html` | class dropdown removed (not collected); creates the session; 3-arm permuted blocks; redirects to `consent.html` |
| `consent.html` | new; the OSU consent form, gated on sign-in, with an agreement checkbox; writes `consentGivenAt` to the user doc and the session |
| `instructions.html`, `reading-instructions.html` | new; static, auth-guarded, pass the query string through |
| `post-task.html` | rebuilt as four open CIMO reflection questions, one text box each (Context / Intervention / Mechanism / Outcome); saved under `postTask.reflection` |
| `quiz.html` | new; study-aom's closed-book quiz mechanics (single-choice + "Not Sure", timer, confidence rating, auto-grading) with 15 items on Häfner (2014) from `quiz_review.csv` (rows marked `final_15`) |
| `survey.html` / `survey2.html` | `post-study-survey.html` split in two: reading experience before the quiz, comprehension and application after the post-task |
| `complete.html` | asks for an OSU `name.#` when the participant signed in with a non-OSU address |
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

**Point events** — every `logEvent()` call study2 already made is kept and
persisted without a whitelist. Duplicates between study2's events and the
recorder's were removed, keeping whichever carries more information.

| group | types |
|---|---|
| session | `reading_start` `reading_paused` `reading_resumed` `reading_phase_complete` (summary payload) `reading_end` `finish_reading_clicked/confirmed/cancelled` |
| window | `window_activated` `window_deactivated` (`cause`, `documentHidden`) `window_closed_during_reading` (beacon only) |
| panel | `focus_switch` (`from`, `to`, `timeOnPreviousFocus`) `resource_tab_switch` `panel_resized` |
| paper | `pdf_activity` (`area_enter` / `area_leave` / `wheel`) `scroll_action` (reading / scanning / scrolling classification at focus change) |
| media | `audio_play/pause/ended/seeked` (`seeked` carries `from`) `video_*` likewise |
| chat | `llm_activity` (typing / none-typing bursts) `llm_question_asked` `llm_answer_received` (+ CIMO context fields) |

Paper scroll position is intentionally not logged for now.

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

## Reading session rules

- **Minimum 15 minutes** of reading before Finish is accepted, measured on the
  header clock (`⏱`), which stops while paused. Refusals are logged as
  `finish_blocked_min_time`. The check is client-side, like the rest of
  study2's flow; the recorder's `reading` interval stream has the exact
  on/paused spans if a session ever needs auditing. Constant:
  `MIN_READING_SECONDS` in `docs/reading.html`.
- **Any arm with a chatbot is asked to use it at least once.** Pressing Finish
  with no questions sent brings up a prompt; the participant may still go on.
  Logged as `finish_no_llm_prompted` and then `finish_no_llm_returned` or
  `finish_no_llm_skipped`, and `finish_reading_confirmed` carries `llmQueryCount`
  and `chatSkipped`. Stated up front in `reading-instructions.html` (that page
  shows the tools block only in the arms that have them).
- Test bypass: `localStorage.devSkipMinTime = '1'` in the browser console skips
  both the 15-minute floor and the chat requirement. It is only meaningful to
  someone who reads this file.
- The only pre-reading instruction participants see is the start popup in
  `reading.html` ("Before You Start … only use the tools provided on this
  platform" + agreement checkbox). There is no separate instruction page; if
  the 15-minute rule, the pause button and the do-not-close warning should be
  stated up front, that popup is the place.

## Sign-in email

`sendLoginEmail` sends through the study Gmail account like study2, but the link
in the message points **directly at `bae4147.github.io/study-ug/login.html`**
with the `oobCode` in the query string, instead of at
`study-ug-osu.firebaseapp.com/__/auth/action` (which only redirects there).
Microsoft 365 quarantines mail that links to domains it has never seen, and a
new Firebase project's auth domain is exactly that. `login.html` already
handles this URL shape — it is what the redirect produced anyway.

## Before recruiting

- [ ] Edit participant-facing copy (post-task / surveys still read as the MBA study)
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
