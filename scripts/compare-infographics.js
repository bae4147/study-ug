#!/usr/bin/env node
// Step 3, infographic: the same prompt on each candidate image model, several
// runs each, saved for scoring against evaluation/fact-checklist.md.
//
//   OPENAI_API_KEY=... GEMINI_API_KEY=... node scripts/compare-infographics.js [runs] [config-id]
//
// Output: evaluation/runs/<date>/infographic/<config>/<task>-r<n>.png + .json,
// plus summary.csv. Resumable: finished images are skipped.

const fs = require("fs");
const path = require("path");
const gen = require("../functions/generation");

const keys = { openai: process.env.OPENAI_API_KEY, gemini: process.env.GEMINI_API_KEY };
if (!keys.openai || !keys.gemini) { console.error("Set OPENAI_API_KEY and GEMINI_API_KEY."); process.exit(1); }

const RUNS = Number(process.argv[2] || 3);
const ONLY = process.argv[3] || null;
const DATE = new Date().toISOString().slice(0, 10);
const OUT = path.join(__dirname, "..", "evaluation", "runs", DATE, "infographic");

// Nano Banana Pro (the GA release of what production uses as a preview),
// Nano Banana 2 (what the video slides use), and OpenAI's current image model.
const CONFIGS = [
    { id: "nano-banana-pro", imageModel: { provider: "gemini", model: "gemini-3-pro-image" } },
    { id: "nano-banana-2",   imageModel: { provider: "gemini", model: "gemini-3.1-flash-image" } },
    { id: "gpt-image-2",     imageModel: { provider: "openai", model: "gpt-image-2" } }
].filter(c => !ONLY || c.id === ONLY);

const REQUEST = "Focus on the results at 2 and 4 weeks.";
const TASKS = { default: null, request: REQUEST };

const jobs = [];
for (const c of CONFIGS) for (const task of Object.keys(TASKS)) for (let r = 1; r <= RUNS; r++) jobs.push({ c, task, r });

async function runOne({ c, task, r }) {
    const base = path.join(OUT, c.id, `${task}-r${r}`);
    if (fs.existsSync(base + ".json")) return;
    fs.mkdirSync(path.dirname(base), { recursive: true });
    const t0 = Date.now();
    const rec = { config: c.id, task, run: r, imageModel: c.imageModel, focus: TASKS[task] };
    try {
        const out = await gen.generateInfographic({ keys, focus: TASKS[task], imageModel: c.imageModel });
        const ext = out.contentType.includes("jpeg") ? "jpg" : "png";
        fs.writeFileSync(`${base}.${ext}`, out.image);
        rec.file = path.basename(`${base}.${ext}`);
        rec.bytes = out.image.length;
        rec.modelNote = out.modelNote;
    } catch (e) {
        rec.error = String(e.message).slice(0, 500);
    }
    rec.seconds = +((Date.now() - t0) / 1000).toFixed(1);
    fs.writeFileSync(base + ".json", JSON.stringify(rec, null, 1));
    console.log(`${rec.error ? "FAIL" : " ok "} ${c.id.padEnd(16)} ${task.padEnd(8)} r${r}  ${rec.seconds}s ${rec.error || ""}`);
}

(async () => {
    let next = 0;
    await Promise.all(Array.from({ length: 3 }, async () => { while (next < jobs.length) await runOne(jobs[next++]); }));
    const lines = ["config,task,run,model,seconds,file,error"];
    for (const dir of fs.readdirSync(OUT).filter(d => fs.statSync(path.join(OUT, d)).isDirectory())) {
        for (const f of fs.readdirSync(path.join(OUT, dir)).filter(x => x.endsWith(".json"))) {
            const d = JSON.parse(fs.readFileSync(path.join(OUT, dir, f), "utf8"));
            lines.push([d.config, d.task, d.run, d.imageModel.model, d.seconds, d.file || "", d.error ? JSON.stringify(d.error.slice(0, 80)) : ""].join(","));
        }
    }
    fs.writeFileSync(path.join(OUT, "summary.csv"), lines.join("\n") + "\n");
})();
