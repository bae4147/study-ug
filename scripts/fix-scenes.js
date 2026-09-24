#!/usr/bin/env node
// Redraws individual slides of a generated slideshow. The image models garble
// words they letter into the picture often enough that a full run usually has a
// few slides to fix, and redrawing one costs a few seconds instead of rerunning
// the whole video.
//
//   GEMINI_API_KEY=... node scripts/fix-scenes.js 4 5 9 19
//
// Narration and its audio are untouched; only the picture changes.

const fs = require("fs");
const path = require("path");
const gen = require("../functions/generation");

const FILE = process.env.VIDEO_JSON ||
    path.join(__dirname, "..", "docs", "papers", "hafner2014", "video.generated.json");
const keys = { gemini: process.env.GEMINI_API_KEY };

const wanted = process.argv.slice(2).map(Number).filter(Boolean);
if (!keys.gemini || wanted.length === 0) {
    console.error("Usage: GEMINI_API_KEY=... node scripts/fix-scenes.js <scene numbers…>");
    process.exit(1);
}

// Slides drawn before the prompt fields were kept have to have one derived from
// their narration. Asking for very little lettering is also the cheapest way to
// cut the chance of the text coming back mangled a second time.
async function promptFromNarration(narration) {
    const ask = `A slide in an explainer video is illustrated for this narration:

"""${narration}"""

Return ONLY JSON: {"key_text_elements": ["..."], "layout_description": "...", "visual_prompt": "..."}

- key_text_elements: at most THREE short items, four words each at the very most, common English words only. These are lettered into the picture, so avoid anything a hand-letterer could misspell.
- layout_description: one sentence on the arrangement.
- visual_prompt: two or three sentences describing one clear illustration. Carry the meaning in the drawing, not in text.`;

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${keys.gemini}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: ask }] }],
                generationConfig: { temperature: 0.6, response_mime_type: "application/json" }
            })
        }
    );
    if (!res.ok) throw new Error(await res.text());
    const raw = (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text || "";
    return JSON.parse(raw.replace(/^```json\s*/i, "").replace(/```\s*$/, ""));
}

(async () => {
    const doc = JSON.parse(fs.readFileSync(FILE, "utf8"));
    const backup = FILE.replace(/\.json$/, `.bak-${Date.now()}.json`);
    fs.writeFileSync(backup, JSON.stringify(doc));
    console.log(`backup: ${path.basename(backup)}`);

    for (const n of wanted) {
        const scene = doc.scenes.find(s => s.sceneNumber === n);
        if (!scene) { console.log(`  scene ${n}: not in this file, skipped`); continue; }

        let spec = scene.visualPrompt
            ? scene
            : await promptFromNarration(scene.narration);
        if (!scene.visualPrompt) {
            console.log(`  scene ${n}: text → ${JSON.stringify(spec.key_text_elements)}`);
        }

        const image = await gen.drawSlide({ keys, scene: spec });
        if (!image) { console.log(`  scene ${n}: redraw failed, left as it was`); continue; }

        scene.imageBase64 = image;
        scene.keyTextElements = spec.key_text_elements || spec.keyTextElements || [];
        scene.layoutDescription = spec.layout_description || spec.layoutDescription || "";
        scene.visualPrompt = spec.visual_prompt || spec.visualPrompt || "";
        console.log(`  scene ${n}: redrawn`);
    }

    fs.writeFileSync(FILE, JSON.stringify(doc));
    console.log(`saved ${path.basename(FILE)}`);
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
