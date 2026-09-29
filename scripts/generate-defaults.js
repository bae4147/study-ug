#!/usr/bin/env node
// Builds the default media every multimodal arm sees, with the same pipeline the
// customisation arms run live, so the only difference between the arms is who
// wrote the focus instruction.
//
// The defaults are chosen, not taken as they come: the cheap text step is run a
// few times, each draft is scored against evaluation/fact-checklist.md, and only
// the chosen one is voiced or drawn.
//
//   OPENAI_API_KEY=... GEMINI_API_KEY=... node scripts/generate-defaults.js <step> [n | file]
//
//   audio-scripts 3            three podcast scripts         -> CANDIDATES/audio-script-<i>.txt
//   audio <script.txt>         voice the chosen script       -> docs/.../audio.generated.mp3 (+ .script.txt)
//   video-plans 3              three scene plans             -> CANDIDATES/video-plan-<i>.json
//   video <plan.json>          draw + narrate the chosen plan -> docs/.../video.generated.json
//   infographics 4             four infographics             -> CANDIDATES/infographic-<i>.<ext>
//
// CANDIDATES is evaluation/defaults/<date>/, kept with the scores so the choice
// can be checked later. Nothing in docs/ is overwritten: the chosen media land
// under .generated names, and promoting them (scripts/promote-video.js, renaming
// the audio and infographic) is a deliberate second step.

const fs = require("fs");
const path = require("path");
const gen = require("../functions/generation");

const OUT = path.join(__dirname, "..", "docs", "papers", "hafner2014");
const CANDIDATES = path.join(__dirname, "..", "evaluation", "defaults", new Date().toISOString().slice(0, 10));
const keys = { openai: process.env.OPENAI_API_KEY, gemini: process.env.GEMINI_API_KEY };

if (!keys.openai || !keys.gemini) {
    console.error("Set OPENAI_API_KEY and GEMINI_API_KEY in the environment.");
    process.exit(1);
}

const [step, arg] = process.argv.slice(2);
const count = Number(arg) || 3;
const progress = (label) => (p) => {
    const bit = p.total ? ` ${p.done || 0}/${p.total}` : "";
    console.log(`  [${label}] ${p.message || p.step}${bit}`);
};
const secs = (t) => `${((Date.now() - t) / 1000).toFixed(0)}s`;
// Candidates are independent, so they run side by side.
const many = (n, fn) => Promise.all(Array.from({ length: n }, (_, i) => fn(i + 1)));

const STEPS = {
    "audio-scripts": async () => {
        fs.mkdirSync(CANDIDATES, { recursive: true });
        await many(count, async (i) => {
            const t = Date.now();
            const r = await gen.generateAudio({ keys, speech: false });
            fs.writeFileSync(path.join(CANDIDATES, `audio-script-${i}.txt`), r.script);
            console.log(`  audio-script-${i}.txt: ${r.finalWords} words (target ${r.targetWords}), ${secs(t)}`);
        });
    },
    audio: async () => {
        if (!arg) throw new Error("give the chosen script file");
        const t = Date.now();
        const r = await gen.generateAudio({ keys, script: fs.readFileSync(arg, "utf8"), onProgress: progress("audio") });
        fs.writeFileSync(path.join(OUT, "audio.generated.mp3"), r.audio);
        fs.writeFileSync(path.join(OUT, "audio.generated.script.txt"), r.script);
        console.log(`  saved audio.generated.mp3 (${(r.audio.length / 1e6).toFixed(1)} MB, ${r.segments} lines, ${secs(t)}); models ${JSON.stringify(gen.modelsInUse("audio"))}`);
    },
    "video-plans": async () => {
        fs.mkdirSync(CANDIDATES, { recursive: true });
        await many(count, async (i) => {
            const t = Date.now();
            const p = await gen.planVideo({ keys });
            fs.writeFileSync(path.join(CANDIDATES, `video-plan-${i}.json`), JSON.stringify(p, null, 1));
            const w = p.scenes.reduce((n, s) => n + (s.narration || "").split(/\s+/).filter(Boolean).length, 0);
            console.log(`  video-plan-${i}.json: ${p.scenes.length} scenes, ${w} words (~${(w / gen.WPM.narration).toFixed(1)} min), ${secs(t)}`);
        });
    },
    video: async () => {
        if (!arg) throw new Error("give the chosen plan file");
        const t = Date.now();
        const plan = JSON.parse(fs.readFileSync(arg, "utf8"));
        const r = await gen.generateVideo({ keys, plan, onProgress: progress("video") });
        fs.writeFileSync(path.join(OUT, "video.generated.json"), JSON.stringify(r));
        console.log(`  saved video.generated.json (${r.totalScenes} scenes, ~${Math.round(r.approxSeconds / 60)} min, ${secs(t)}); models ${JSON.stringify(gen.modelsInUse("video"))}`);
    },
    infographics: async () => {
        fs.mkdirSync(CANDIDATES, { recursive: true });
        await many(count, async (i) => {
            const t = Date.now();
            const r = await gen.generateInfographic({ keys });
            const ext = r.contentType.includes("jpeg") ? "jpg" : "png";
            fs.writeFileSync(path.join(CANDIDATES, `infographic-${i}.${ext}`), r.image);
            console.log(`  infographic-${i}.${ext}: ${(r.image.length / 1e6).toFixed(1)} MB, ${secs(t)}`);
        });
    }
};

(async () => {
    if (!STEPS[step]) throw new Error(`unknown step "${step}"; one of: ${Object.keys(STEPS).join(", ")}`);
    const started = Date.now();
    await STEPS[step]();
    console.log(`done in ${secs(started)}`);
})().catch(e => {
    console.error("\nFAILED:", e.message);
    process.exit(1);
});
