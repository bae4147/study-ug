# Fact checklist — Häfner, Stock & Oberst (2014)

Reference for scoring generated media (audio scripts, video scene plans and
narration, infographics) against the paper in the model comparison. Page numbers
are the PDF viewer's (printed page = viewer page + 80).

## How to score a generated piece

List the factual claims the piece makes, then mark each one:

| Code | Meaning |
|---|---|
| **OK** | Agrees with the paper |
| **WRONG** | Contradicts the paper (a number, a direction, a significance, a time point) |
| **ADDED** | Not in the paper — a detail, example, figure or claim it does not contain |
| **OVERSTATED** | Drops a hedge or strengthens a claim ("proves" for "at least to some extent") |
| **MISATTRIBUTED** | Right fact, wrong owner (a cited study's figure given as this study's; the authors' interpretation given as a finding or as "theorists") |
| **COMPUTED** | A figure the paper does not state, derived from its figures (e.g. 61% from 30.4 + 30.4) |

Leaving a fact out is **not** an error: no required-content list is imposed on
outputs (decision of 2026-09-26). Request uptake and length are scored
separately.

**Two totals are reported per piece**, because the codes are not equally serious:

- **Factual errors** = WRONG + MISATTRIBUTED. The primary measure in the model
  comparison: the piece tells the reader something false about the study.
- **Fidelity lapses** = ADDED + OVERSTATED + COMPUTED. Reported beside it: the
  piece goes beyond the paper, even when what it says may be true (a correctly
  computed percentage, a plausible added detail).

**Rater.** Scored by Claude (Anthropic). The candidates are OpenAI and Google
models only, so the rater is from neither vendor, which avoids a model favouring
output from its own family. For reporting, a random sample should be re-scored
by a person to give an agreement figure.

Use the checklist below for the claims it covers; check anything else against
the paper text directly.

---

## A. The study

| ID | Fact | Page |
|---|---|---|
| A1 | Aim: effects of a time management training on **perceived control of time** and **perceived stress** in higher education | 1 |
| A2 | **Non-equivalent dependent variable design** (Cook & Campbell 1979): one trained group, **no control group**. Perceived stress and perceived control of time were expected to change; **demands** were measured as a control variable expected **not** to change | 1, 4 |
| A3 | Measured **directly before**, **2 weeks after** and **4 weeks after** training, all within the same semester, before participants' most important exam | 6–7 |

## B. Sample

| ID | Fact | Page |
|---|---|---|
| B1 | **48** undergraduates of a medium-sized German university took part; **23** answered all questionnaires (analysed n = 23) | 6 |
| B2 | "**About half**" of the students left before the second measurement. The paper gives no percentage — a stated % is COMPUTED | 11 |
| B3 | Dropouts did not differ from completers on the four study variables, age, semester or sex | 8 |
| B4 | Mean age **23.30** (SD 2.80); about half female (**52%**); different subjects (psychology, medicine, biology, pedagogy, physics, law, computer science) and years of study | 6, 10 |
| B5 | Prior time-management experience (Table 2): none **30.4%**, little **30.4%**, moderate **34.8%**, some more **4.4%**, quite a lot 0%. "Overall, they had little experience." No combined figure is given | 7, 10 |

## C. The training

| ID | Fact | Page |
|---|---|---|
| C1 | **4 hours** in total ("a rather short intervention"); groups of **about ten**; **one trainer**; in the middle of the semester; extracurricular | 6, 10 |
| C2 | Five parts, in order: **(1)** self-reflection on current activities and their importance, defining the most important ones; **(2)** concrete, challenging, **proximal goals** with deadlines; **(3)** a **strategy** — steps, priorities, how to start, anticipating obstacles (mentally simulating the way to the goal); **(4)** **daily planning** — a concrete schedule, implementation intentions (when and where), how much time, avoiding distractions, which tasks to concentrate on tomorrow; **(5)** **monitoring** — checking each day which tasks were completed and what still has to be done | 5–6 |
| C3 | A deliberately **homogeneous** intervention — no relaxation or assertiveness components, which the authors see as a methodological advantage | 11 |

## D. Measures (all rated 1–5)

| ID | Fact | Page |
|---|---|---|
| D1 | Time management behaviour: **18 items** (Oberst 2008) | 7 |
| D2 | Perceived stress = the **tension** scale of the Perceived Stress Questionnaire, **5 items** (mental fatigue, trouble relaxing, nervousness). Not "anxiety" in general | 7 |
| D3 | Perceived control of time: **10 items**, adapted from Macan et al. (1990) — feeling in control of one's time, estimating task time correctly, avoiding procrastination | 8 |
| D4 | **Demands**: the PSQ demands scale, **5 items** — amount of work, external duties. **Perceived, self-reported** demands, not actual workload or course difficulty | 8 |

## E. Results — the most error-prone part

| ID | Fact | Page |
|---|---|---|
| E1 | Time management behaviour: **significant** increase at **4 weeks** (t(22) = 2.67, p < .01, one-tailed); only a **nearly significant** increase at **2 weeks** (t(22) = 1.62, p = .060) | 8 |
| E2 | Stress (tension): **significantly lower at 2 weeks** (F(1,22) = 8.22, p < .01, partial η² = .27) **and at 4 weeks** (F(1,22) = 5.75, p = .03, partial η² = .21). Means 3.30 → **2.96** → 3.03: **lowest at 2 weeks**; the effect is *not* stronger at 4 weeks | 8–9 |
| E3 | Perceived control of time: **not significant at 2 weeks — only a tendency** (F(1,22) = 3.38, p = .08); **significant at 4 weeks** (F(1,22) = 11.62, p < .01, partial η² = .35). Means 2.75 → 2.89 → 3.05. "Increased … but with a time lag" | 8–9 |
| E4 | Demands: **no significant change** at 2 weeks (t(22) = 1.68, p = .107) or 4 weeks (t(22) = 1.19, p = .251). Means 3.59 → 3.35 → 3.46 | 9 |
| E5 | MANOVA overall time effect significant at both comparisons (2 weeks: F(2,21) = 4.09, p = .03; 4 weeks: F(2,21) = 6.01, p < .01) | 9 |
| E6 | Effects much stronger for students with **no or little** experience (n = 14) than with moderate or some (n = 9): at 4 weeks, effect sizes **more than twice as strong** (ε′ = .78 vs .34 for control of time; .64 vs .13 for stress), especially for stress | 9–10 |
| E7 | At time 1 (n = 48): control of time correlated −.44 with stress and −.55 with demands; stress and demands .66 | 8 |

## F. Interpretation — the authors', with their hedges

| ID | Fact | Page |
|---|---|---|
| F1 | Conclusion: results "support the conclusion that the training led to a decrease of perceived stress and an increase of perceived control of time"; effects "can be judged as very strong". Abstract: training "**might** be beneficial" for well-being | 1, 10 |
| F2 | Transfer: trainees transferred the training content to their daily work "**at least to some extent**" — not "proved" or "successfully" | 11 |
| F3 | Why it may work — the **authors' suggestions**, all with "might": prioritising, goals and strategies give **orientation**; daily planning makes starting goal-oriented behaviour easier; monitoring gives reinforcing information | 10 |
| F4 | On the design: results "were **probably** caused by" the training; a design with a control group, especially pseudo-training groups, "would be a methodological alternative and improvement" | 10–11 |

## G. Limitations and future work

| ID | Fact | Page |
|---|---|---|
| G1 | Small sample → "should be seen as a **preliminary study**"; larger samples needed; there are **no meta-analyses** in time management research | 11 |
| G2 | About half the students left before the second measurement; such dropout is common; obligation or incentives lower it | 11 |
| G3 | No control group (see F4) | 10–11 |
| G4 | Future research: compare with other stress interventions (social support, exercise, relaxation, meditation); **persistence** of outcomes; effects on **performance** | 11 |
| G5 | Practical ideas (hedged, "might be good advice"): prioritising; clear, challenging, proximal goals with deadlines; planning and scheduling the work day; monitoring goal progress; trainings for freshmen or within other courses | 11 |

## H. Cited studies — belong to their authors, not to this study

| ID | Fact | Page |
|---|---|---|
| H1 | **Pierceall & Keim (2007)**, 212 **community college** students: 75% at least moderate stress, 13% high, 12% low; unhealthy coping — drinking 39%, smoking 36%, illegal drugs 15% | 1–2 |
| H2 | **Van der Meer et al. (2010)**: more than 1,000 undergraduates; time management "a considerable concern" | 2–3 |
| H3 | **Frese et al. (2003)**: the indented quotation in the Design section, on the advantages of the design | 4–5 |
| H4 | Effective time management as "a combination of time assessment, goal setting, planning, and monitoring activities" — quoted from **Häfner & Stock (2010)** | 3 |

---

## Errors already seen (2026-09-24 to 09-26)

Useful as a watch list; each shows the code it would get.

| Seen in | Claim | Code | Against |
|---|---|---|---|
| default video, before rework | "up to 75% of university students experience moderate stress" | MISATTRIBUTED | H1 |
| default video, before rework | "perceived control over time increased significantly after the intervention" | WRONG | E3 |
| default video, before rework | "demands remained perfectly stable … no change in actual course difficulty" | OVERSTATED | D4, E4 |
| default video, before rework | "reduction in feelings of anxiety and mental fatigue" | WRONG | D2 |
| default video, before rework | "high dropout rates … campuses nationwide" | ADDED | — |
| video plan with request, step 2 | "every afternoon or evening, students planned for the following day" | ADDED | C2 |
| video plan with request, step 2 | "tasks that needed rescheduling" | ADDED | C2 |
| video plan with request, step 2 | "proving they successfully transferred" | OVERSTATED | F2 |
| video plan with request, step 2 | "theorists propose …" | MISATTRIBUTED | F3 |
| video plan, step 2 | "a fifty-two percent dropout rate"; "60.8 percent" | COMPUTED | B2, B5 |
| 3.5-min audio, step 2 | stress and control effects "more pronounced four weeks after" | WRONG | E2 |
| 3.5-min audio, step 2 | "about 61% reporting no or little experience" | COMPUTED | B5 |
| 3.5-min audio, step 2 | the authors "argued that their design effectively ruled out placebo effects" | OVERSTATED | F4 |
