#!/usr/bin/env node
// Turns a generated slideshow into what the study serves: one image and one
// narration per scene beside a manifest, rather than a single base64 blob the
// browser must parse in full before it can show anything.
//
//   node scripts/promote-video.js
//
// The durations in the manifest are measured off the narration files, not taken
// from the outline. The outline's "9 seconds a scene" is a planning figure the
// speech never actually matches, and a timeline built on it drifts scene by
// scene and cannot be seeked accurately.

const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "docs", "papers", "hafner2014");
const SRC = process.env.VIDEO_JSON || path.join(DIR, "video.generated.json");
const OUT = path.join(DIR, "video");

// Walks MPEG audio frame headers and sums their playing time. It has to read
// the version bits: OpenAI's speech comes back as 24 kHz MPEG-2 Layer III, whose
// frames hold 576 samples and use their own bitrate table. A reader that assumes
// MPEG-1 (1,152 samples, 32/44.1/48 kHz) gets exactly half the real length --
// which is what this used to do, so every duration it wrote was halved.
function mp3Seconds(buf) {
    const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
    const BITRATE_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
    const BITRATE_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    let i = 0, seconds = 0;
    while (i < buf.length - 4) {
        if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0 && ((buf[i + 1] >> 1) & 3) === 1) {   // layer III
            const version = (buf[i + 1] >> 3) & 3;           // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
            const bIdx = (buf[i + 2] >> 4) & 0xf, rIdx = (buf[i + 2] >> 2) & 3, pad = (buf[i + 2] >> 1) & 1;
            if (version !== 1 && bIdx > 0 && bIdx < 15 && rIdx < 3) {
                const v1 = version === 3;
                const rate = RATES[version][rIdx];
                const kbps = (v1 ? BITRATE_V1 : BITRATE_V2)[bIdx];
                const samples = v1 ? 1152 : 576;
                seconds += samples / rate;
                i += Math.floor((samples / 8) * kbps * 1000 / rate) + pad;
                continue;
            }
        }
        i++;
    }
    return seconds;
}

const doc = JSON.parse(fs.readFileSync(SRC, "utf8"));
fs.mkdirSync(OUT, { recursive: true });

const scenes = doc.scenes.map((s) => {
    const n = String(s.sceneNumber).padStart(2, "0");
    const image = Buffer.from(s.imageBase64, "base64");
    const audio = Buffer.from(s.audioBase64, "base64");
    fs.writeFileSync(path.join(OUT, `scene${n}.png`), image);
    fs.writeFileSync(path.join(OUT, `scene${n}.mp3`), audio);
    return {
        sceneNumber: s.sceneNumber,
        image: `video/scene${n}.png`,
        audio: `video/scene${n}.mp3`,
        duration: Math.round(mp3Seconds(audio) * 100) / 100,
        narration: s.narration || "",
        // what the slide was asked to letter; only present for slides drawn after
        // the pipeline started keeping it (and for every redrawn one)
        slideText: s.keyTextElements || null
    };
});

const total = scenes.reduce((n, s) => n + s.duration, 0);
fs.writeFileSync(
    path.join(DIR, "video.json"),
    JSON.stringify({ title: doc.title, totalScenes: scenes.length, totalSeconds: Math.round(total * 100) / 100, scenes })
);

console.log(`${scenes.length} scenes → video.json + video/`);
console.log(`total ${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, "0")} (measured, not the outline's estimate)`);
