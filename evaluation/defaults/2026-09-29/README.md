# Default media, rebuilt 2026-09-29 (step 5)

Final models (GENERATION.md, step 4): scripts and scene plan `gpt-5.5-2026-04-23`,
slides and infographic `gemini-3-pro-image`, speech `tts-1` / `tts-1-hd`.
Each piece was drafted several times, scored against
`evaluation/fact-checklist.md`, and only the chosen draft was voiced or drawn
(`scripts/generate-defaults.js`).

## Audio

`audio-before-spoken-rule/`: the first three scripts. All were accurate, but all
read test statistics aloud ("F(1, 22)=8.22, p<0.01"), which a listener cannot
follow. The script prompt now says results are given in words and test
statistics are not read out; the three scripts in this folder were written with
that rule.

| script | words | flags | note |
|---|---|---|---|
| 1 | 335 | 0 | **chosen** — covers 48 → 23, results with means, hedges, limits, closing takeaway |
| 2 | 414 | 0 | too long (target 281–343) |
| 3 | 299 | 0 | no closing takeaway |

`audio-chosen.txt` = script 1 with "4 h" → "4 hours" (the voice reads "4 h" as
"four H"). Voiced with `tts-1`: 20 lines, 2:20.

## Video

| plan | flags | read-aloud problems |
|---|---|---|
| 1 | ADDED 1 (monitoring described as "that day") | "4 h", "SD=2.80" |
| 2 | 0 | "4 h", "SD=2.80" |
| 3 | 0 | "SD=2.80"; four opening scenes on cited studies |

**Plan 2 chosen**: closest to the study itself (design, training, results, the
authors' hedged interpretation, limits). `video-chosen.json` = plan 2 with two
narration edits for speech only: scene 8 drops "SD=2.80", scene 9 "4 h" →
"4-hour". The plan prompt now asks for narration written as it is said.

## Infographic

| candidate | flags | note |
|---|---|---|
| 1 | 0 | **chosen** — text-led, every figure and p value right, hedges kept |
| 2 | GARBLED 1, OVERSTATED 1 | charts of the means drawn correctly, but "Signifcanty", a duplicated label, and the authors' interpretation stated as a causal chain |
| 3 | WRONG 1 | stress line keeps falling to 4 weeks (lowest is at 2 weeks) |
| 4 | WRONG 2 | same stress line; demands line shaped wrong |

## Audio, second round: a conversation instead of an interview

The chosen script above was accurate but read as a question-and-answer drill
(researcher's verdict: dull). Three causes, all in the prompt: the length rule
asked for about words/25 lines (12 for two minutes), so each host spoke in long
blocks; the hosts were defined only as "asks" and "explains"; and the opening
was held to one line. gpt-5.5 is also terser than gpt-4o, whose liveliness came
with overstatement ("Yes, it did!").

Prompt changes: the hosts react to each other (surprise, "So basically...",
follow-ups, the odd light joke), a few points told as a story rather than every
detail, about words/14 lines with no one speaking for more than about three
sentences, and liveliness never adds content (the source rules are unchanged).

`audio-lively/`: script-1..3 were written before the line-count change (12-13
lines), script-4..6 after (26-30 lines). All six: no flags.
**script-4 chosen** (383 words, 26 lines, closest to length): voiced with
tts-1, 2:36 — 6 s over the 2:30 upper bound, accepted by the researcher.
