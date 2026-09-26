#!/usr/bin/env node
// Step 3, speech: the same podcast script and the same video narration read by
// each candidate TTS, for listening and for re-measuring words per minute.
//
//   OPENAI_API_KEY=... GEMINI_API_KEY=... node scripts/compare-tts.js
//
// Podcast: gpt-5.5's default script (run 1). Narration: the first 6 scenes of
// gemini-3.1-pro's default video plan (run 1). Output: evaluation/runs/<date>/tts/.

const fs = require("fs");
const path = require("path");

const keys = { openai: process.env.OPENAI_API_KEY, gemini: process.env.GEMINI_API_KEY };
if (!keys.openai || !keys.gemini) { console.error("Set OPENAI_API_KEY and GEMINI_API_KEY."); process.exit(1); }
const DATE = "2026-09-26";
const RUNS = path.join(__dirname, "..", "evaluation", "runs", DATE);
const OUT = path.join(RUNS, "tts");
fs.mkdirSync(OUT, { recursive: true });

const script = JSON.parse(fs.readFileSync(path.join(RUNS, "gpt-5.5", "audio_default-r1.json"), "utf8")).output;
const lines = script.split("\n").map(l => l.trim()).map(l => {
    const m = l.match(/^\**(Alex|Jordan)\**\s*:\s*(.+)$/);
    return m ? { speaker: m[1], text: m[2].replace(/\*/g, "").trim() } : null;
}).filter(Boolean);
const plan = JSON.parse(fs.readFileSync(path.join(RUNS, "gemini-3.1-pro", "video_default-r1.json"), "utf8")).output;
const scenes = plan.scenes.slice(0, 6).map(s => s.narration);
const words = (s) => (s.match(/[A-Za-z0-9’'-]+/g) || []).length;

// ---- audio helpers ------------------------------------------------------------
function mp3Seconds(buf) {
    const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
    const V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
    const V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    let i = 0, s = 0;
    while (i < buf.length - 4) {
        if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0 && ((buf[i + 1] >> 1) & 3) === 1) {
            const v = (buf[i + 1] >> 3) & 3, b = (buf[i + 2] >> 4) & 0xf, r = (buf[i + 2] >> 2) & 3, pad = (buf[i + 2] >> 1) & 1;
            if (v !== 1 && b > 0 && b < 15 && r < 3) {
                const rate = RATES[v][r], kbps = (v === 3 ? V1 : V2)[b], n = v === 3 ? 1152 : 576;
                s += n / rate; i += Math.floor((n / 8) * kbps * 1000 / rate) + pad; continue;
            }
        }
        i++;
    }
    return s;
}
function wav(pcm, rate = 24000) {
    const h = Buffer.alloc(44);
    h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
    h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
    h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([h, pcm]);
}
async function pool(items, n, fn) {
    const out = new Array(items.length); let next = 0;
    await Promise.all(Array.from({ length: n }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
    return out;
}

// ---- engines ---------------------------------------------------------------------
async function openaiSpeech({ model, voice, text, instructions }) {
    for (let attempt = 0; attempt < 4; attempt++) {
        let res;
        try {
            res = await fetch("https://api.openai.com/v1/audio/speech", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${keys.openai}` },
                body: JSON.stringify({ model, voice, input: text, response_format: "mp3", ...(instructions ? { instructions } : {}) })
            });
        } catch (e) {
            if (attempt === 3) throw e;
            await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
            continue;
        }
        if (res.ok) return Buffer.from(await res.arrayBuffer());
        if (attempt === 3) throw new Error(`${model}: ${await res.text()}`);
        await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
    }
}
// `parts` is either one text or, for two speakers, one part per line tagged
// with its speaker (the API requires the tag once a multi-speaker config is set).
async function geminiSpeech({ model, parts, speechConfig }) {
    for (let attempt = 0; attempt < 4; attempt++) {
        let res;
        try {
            res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keys.gemini}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ["AUDIO"], speechConfig } })
            });
        } catch (e) {
            if (attempt === 3) throw e;
            await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
            continue;
        }
        if (res.ok) {
            const part = (await res.json()).candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (part) return Buffer.from(part.inlineData.data, "base64");
        }
        if (attempt === 3) throw new Error(`${model}: ${res.ok ? "no audio" : await res.text()}`);
        await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
    }
}

const PODCAST_STYLE = "Two hosts of a short educational podcast for university students, talking naturally and warmly at a relaxed conversational pace.";
const NARRATION_STYLE = "Calm, clear narration for a short explainer video for university students.";
const GEMINI_TTS = "gemini-3.8-flash-tts";

const JOBS = [
    { id: "podcast_tts-1", run: async () => {
        const v = { Alex: "onyx", Jordan: "shimmer" };
        return { mp3: Buffer.concat(await pool(lines, 6, l => openaiSpeech({ model: "tts-1", voice: v[l.speaker], text: l.text }))) };
    } },
    { id: "podcast_gpt-4o-mini-tts", run: async () => {
        const v = { Alex: "cedar", Jordan: "marin" };
        return { mp3: Buffer.concat(await pool(lines, 6, l => openaiSpeech({ model: "gpt-4o-mini-tts", voice: v[l.speaker], text: l.text, instructions: PODCAST_STYLE }))) };
    } },
    { id: `podcast_${GEMINI_TTS}`, run: async () => {
        // one call for the whole dialogue: the model voices both speakers itself.
        // No style line: anything in the input is read aloud.
        const parts = lines.map(l => ({ text: l.text, speechMetadata: { speaker: l.speaker } }));
        const pcm = await geminiSpeech({ model: GEMINI_TTS, parts, speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs: [
            { speaker: "Alex", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } } },
            { speaker: "Jordan", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } }
        ] } } });
        return { pcm };
    } },
    { id: "narration_tts-1-hd", run: async () => ({ mp3: Buffer.concat(await pool(scenes, 6, s => openaiSpeech({ model: "tts-1-hd", voice: "shimmer", text: s }))) }) },
    { id: "narration_gpt-4o-mini-tts", run: async () => ({ mp3: Buffer.concat(await pool(scenes, 6, s => openaiSpeech({ model: "gpt-4o-mini-tts", voice: "marin", text: s, instructions: NARRATION_STYLE }))) }) },
    { id: `narration_${GEMINI_TTS}`, run: async () => {
        const pcms = await pool(scenes, 3, s => geminiSpeech({ model: GEMINI_TTS, parts: [{ text: s }], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } }));
        return { pcm: Buffer.concat(pcms) };
    } }
];

(async () => {
    const rows = ["id,seconds_audio,words,wpm,generation_seconds,file,error"];
    for (const j of JOBS) {
        const n = j.id.startsWith("podcast") ? lines.reduce((a, l) => a + words(l.text), 0) : scenes.reduce((a, s) => a + words(s), 0);
        const metaFile = path.join(OUT, `${j.id}.json`);
        if (fs.existsSync(metaFile)) { const m = JSON.parse(fs.readFileSync(metaFile, "utf8")); rows.push([j.id, m.secs.toFixed(1), n, (n / m.secs * 60).toFixed(0), m.gen, m.file, ""].join(",")); continue; }
        const t0 = Date.now();
        try {
            const r = await j.run();
            const gen = ((Date.now() - t0) / 1000).toFixed(1);
            let file, secs;
            if (r.mp3) { file = `${j.id}.mp3`; fs.writeFileSync(path.join(OUT, file), r.mp3); secs = mp3Seconds(r.mp3); }
            else { file = `${j.id}.wav`; fs.writeFileSync(path.join(OUT, file), wav(r.pcm)); secs = r.pcm.length / 48000; }
            fs.writeFileSync(metaFile, JSON.stringify({ secs, gen, file }));
            rows.push([j.id, secs.toFixed(1), n, (n / secs * 60).toFixed(0), gen, file, ""].join(","));
            console.log(`ok   ${j.id.padEnd(30)} ${secs.toFixed(1)}s audio, ${(n / secs * 60).toFixed(0)} wpm, made in ${gen}s`);
        } catch (e) {
            rows.push([j.id, "", n, "", "", "", JSON.stringify(String(e.message).slice(0, 120))].join(","));
            console.log(`FAIL ${j.id}: ${String(e.message).slice(0, 300)}`);
        }
    }
    fs.writeFileSync(path.join(OUT, "summary.csv"), rows.join("\n") + "\n");
})();
