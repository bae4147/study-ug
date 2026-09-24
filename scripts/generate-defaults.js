#!/usr/bin/env node
// Builds the default media every multimodal arm sees, with the same pipeline the
// customisation arms run live, so the only difference between the arms is who
// wrote the focus instruction.
//
//   OPENAI_API_KEY=... GEMINI_API_KEY=... node scripts/generate-defaults.js [audio|infographic|video] ...
//
// Output lands in docs/papers/hafner2014/. Nothing is overwritten: files are
// written under .generated names for comparison, and renaming them is a
// deliberate second step.

const fs = require("fs");
const path = require("path");
const gen = require("../functions/generation");

const OUT = path.join(__dirname, "..", "docs", "papers", "hafner2014");
const keys = { openai: process.env.OPENAI_API_KEY, gemini: process.env.GEMINI_API_KEY };

if (!keys.openai || !keys.gemini) {
    console.error("Set OPENAI_API_KEY and GEMINI_API_KEY in the environment.");
    process.exit(1);
}

const targets = process.argv.slice(2);
const want = (name) => targets.length === 0 || targets.includes(name);

const progress = (label) => (p) => {
    const bit = p.total ? ` ${p.done || 0}/${p.total}` : "";
    console.log(`  [${label}] ${p.message || p.step}${bit}`);
};

(async () => {
    const started = Date.now();

    if (want("infographic")) {
        console.log("\n— infographic");
        const t = Date.now();
        const r = await gen.generateInfographic({ keys, onProgress: progress("infographic") });
        const ext = r.contentType.includes("jpeg") ? "jpg" : "png";
        const f = path.join(OUT, `infographic.generated.${ext}`);
        fs.writeFileSync(f, r.image);
        console.log(`  saved ${f} (${(r.image.length / 1e6).toFixed(1)} MB, ${((Date.now() - t) / 1000).toFixed(0)}s)`);
    }

    if (want("audio")) {
        console.log("\n— audio");
        const t = Date.now();
        const r = await gen.generateAudio({ keys, onProgress: progress("audio") });
        fs.writeFileSync(path.join(OUT, "audio.generated.mp3"), r.audio);
        fs.writeFileSync(path.join(OUT, "audio.generated.script.txt"), r.script);
        console.log(`  saved audio.generated.mp3 (${(r.audio.length / 1e6).toFixed(1)} MB, ${r.segments} lines, ${((Date.now() - t) / 1000).toFixed(0)}s)`);
    }

    if (want("video")) {
        const length = process.env.VIDEO_LENGTH || "default";
        console.log(`\n— video (${length})`);
        const t = Date.now();
        const r = await gen.generateVideo({ keys, length, onProgress: progress("video") });
        fs.writeFileSync(path.join(OUT, "video.generated.json"), JSON.stringify(r));
        console.log(`  saved video.generated.json (${r.totalScenes} scenes, ~${Math.round(r.approxSeconds / 60)} min, ${((Date.now() - t) / 1000).toFixed(0)}s)`);
    }

    console.log(`\ndone in ${((Date.now() - started) / 1000 / 60).toFixed(1)} min`);
})().catch(e => {
    console.error("\nFAILED:", e.message);
    process.exit(1);
});
