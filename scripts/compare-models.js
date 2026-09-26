#!/usr/bin/env node
// Step 3 of the pipeline review: the same prompts on each candidate text model,
// several runs each, saved for scoring against evaluation/fact-checklist.md.
//
//   OPENAI_API_KEY=... GEMINI_API_KEY=... node scripts/compare-models.js [main|temperature|all] [runs]
//
// Text only -- audio scripts and video scene plans -- because that is where
// accuracy is decided; speech and images come after, on the finalists.
// Output: evaluation/runs/<date>/<config>/<task>-r<n>.json, plus summary.csv.

const fs = require("fs");
const path = require("path");
const gen = require("../functions/generation");

const keys = { openai: process.env.OPENAI_API_KEY, gemini: process.env.GEMINI_API_KEY };
if (!keys.openai || !keys.gemini) { console.error("Set OPENAI_API_KEY and GEMINI_API_KEY."); process.exit(1); }

const which = process.argv[2] || "all";
const RUNS = Number(process.argv[3] || 3);
const DATE = new Date().toISOString().slice(0, 10);
const OUT = path.join(__dirname, "..", "evaluation", "runs", DATE);

const T = gen.TEMPERATURE;
const tm = (provider, model, temperature = T) => ({ provider, model, temperature });

// Each config names the model for the audio script and for the video plan.
// "current" is what production uses today; the rest use one model for both.
// gpt-5.5 accepts only its default temperature, so it runs with none set.
const MAIN = [
    { id: "current",            audio: tm("openai", "gpt-4o"),               video: tm("gemini", "gemini-3.6-flash") },
    { id: "gpt-5.5",            audio: tm("openai", "gpt-5.5", null),        video: tm("openai", "gpt-5.5", null) },
    { id: "gpt-5.4-mini",       audio: tm("openai", "gpt-5.4-mini"),         video: tm("openai", "gpt-5.4-mini") },
    { id: "gemini-3.8-flash",   audio: tm("gemini", "gemini-3.8-flash"),     video: tm("gemini", "gemini-3.8-flash") },
    { id: "gemini-3.1-pro",     audio: tm("gemini", "gemini-3.1-pro-preview"), video: tm("gemini", "gemini-3.1-pro-preview") }
];
// Only the temperature changes; 0.4 is already covered by MAIN.
const TEMPERATURE = [];
for (const [provider, model, short] of [["openai", "gpt-5.4-mini", "gpt-5.4-mini"], ["gemini", "gemini-3.8-flash", "gemini-3.8-flash"]]) {
    for (const temp of [0.2, 0.7]) {
        TEMPERATURE.push({ id: `${short}@t${temp}`, audio: tm(provider, model, temp), video: tm(provider, model, temp), tasks: ["audio_default", "video_default"] });
    }
}

const REQUEST_AUDIO = "Focus on the study's limitations and what it cannot tell us.";
const REQUEST_VIDEO = "Explain step by step what the training actually taught students to do.";
const TASKS = {
    audio_default: (c) => gen.generateAudio({ keys, textModel: c.audio, speech: false }),
    audio_request: (c) => gen.generateAudio({ keys, textModel: c.audio, speech: false, focus: REQUEST_AUDIO }),
    video_default: (c) => gen.planVideo({ keys, textModel: c.video }),
    video_request: (c) => gen.planVideo({ keys, textModel: c.video, focus: REQUEST_VIDEO })
};
const FOCUS = { audio_request: REQUEST_AUDIO, video_request: REQUEST_VIDEO };

const configs = which === "main" ? MAIN : which === "temperature" ? TEMPERATURE : [...MAIN, ...TEMPERATURE];
const jobs = [];
for (const c of configs) {
    for (const task of c.tasks || Object.keys(TASKS)) {
        for (let r = 1; r <= RUNS; r++) jobs.push({ c, task, r });
    }
}

const words = (s) => (s.match(/[A-Za-z0-9’'-]+/g) || []).length;
const rows = [];

async function runOne({ c, task, r }) {
    const file = path.join(OUT, c.id.replace(/[^\w.@-]/g, "_"), `${task}-r${r}.json`);
    if (fs.existsSync(file)) return;                       // resumable
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const model = task.startsWith("audio") ? c.audio : c.video;
    const t0 = Date.now();
    let rec = { config: c.id, task, run: r, textModel: model, focus: FOCUS[task] || null };
    try {
        const out = await TASKS[task](c);
        rec.seconds = +((Date.now() - t0) / 1000).toFixed(1);
        if (task.startsWith("audio")) {
            rec.targetWords = out.targetWords; rec.draftWords = out.draftWords; rec.finalWords = out.finalWords;
            rec.expanded = out.finalWords !== out.draftWords;
            rec.estMinutes = +(out.finalWords / gen.WPM.podcast).toFixed(2);
            rec.output = out.script;
        } else {
            const w = out.scenes.reduce((n, s) => n + words(s.narration || ""), 0);
            rec.targetScenes = out.targetScenes; rec.scenes = out.scenes.length; rec.narrationWords = w;
            rec.estMinutes = +(w / gen.WPM.narration).toFixed(2);
            rec.output = out;
        }
    } catch (e) {
        rec.seconds = +((Date.now() - t0) / 1000).toFixed(1);
        rec.error = String(e.message).slice(0, 500);
    }
    fs.writeFileSync(file, JSON.stringify(rec, null, 1));
    console.log(`${rec.error ? "FAIL" : " ok "} ${c.id.padEnd(22)} ${task.padEnd(14)} r${r}  ${rec.seconds}s  ${rec.estMinutes ?? ""}`);
}

// Six at a time across both providers.
(async () => {
    let next = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
        while (next < jobs.length) await runOne(jobs[next++]);
    }));
    // summary over everything on disk for today
    const lines = ["config,task,run,model,temperature,seconds,estMinutes,target,draftWords,finalWords,expanded,scenes,narrationWords,error"];
    for (const dir of fs.readdirSync(OUT)) {
        for (const f of fs.readdirSync(path.join(OUT, dir)).filter(x => x.endsWith(".json"))) {
            const d = JSON.parse(fs.readFileSync(path.join(OUT, dir, f), "utf8"));
            lines.push([d.config, d.task, d.run, d.textModel.model, d.textModel.temperature ?? "default", d.seconds,
                d.estMinutes ?? "", d.targetWords ?? d.targetScenes ?? "", d.draftWords ?? "", d.finalWords ?? "",
                d.expanded ?? "", d.scenes ?? "", d.narrationWords ?? "", d.error ? JSON.stringify(d.error.slice(0, 80)) : ""].join(","));
        }
    }
    fs.writeFileSync(path.join(OUT, "summary.csv"), lines.join("\n") + "\n");
    console.log(`\n${jobs.length} jobs; summary -> ${path.relative(process.cwd(), path.join(OUT, "summary.csv"))}`);
})();
