#!/usr/bin/env node
// Step 4, chatbot: the same student questions to each candidate chat model, with
// the exact system prompt the chat-only arm uses in docs/reading.html, for
// scoring against evaluation/fact-checklist.md and for response time.
//
//   OPENAI_API_KEY=... node scripts/compare-chatbot.js
//
// Output: evaluation/runs/<date>/chatbot/<model>.json

const fs = require("fs");
const path = require("path");

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { console.error("Set OPENAI_API_KEY."); process.exit(1); }
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "evaluation", "runs", new Date().toISOString().slice(0, 10), "chatbot");
fs.mkdirSync(OUT, { recursive: true });

// Rebuild the prompt from reading.html itself so the test cannot drift from it.
const html = fs.readFileSync(path.join(ROOT, "docs", "reading.html"), "utf8");
const grab = (name) => {
    const start = html.indexOf(`const ${name} = \``) + `const ${name} = \``.length;
    return html.slice(start, html.indexOf("`;", start));
};
const paper = fs.readFileSync(path.join(ROOT, "docs", "papers", "hafner2014", "paper.txt"), "utf8").replace(/<[^>]*>/g, "");
const paperForPrompt = grab("paperForPrompt").replace("${paperContent.replace(/<[^>]*>/g, '')}", paper);
const system = grab("controlSystemPrompt").replace("${paperForPrompt}", paperForPrompt);
if (system.includes("${")) throw new Error("unfilled placeholder in the system prompt");

// Questions a student might ask, several of them traps the checklist covers.
const QUESTIONS = [
    "What was the main finding of this study?",
    "Did perceived control of time improve two weeks after the training?",
    "At which point was stress the lowest?",
    "How many students took part?",
    "What exactly did the training teach students to do?",
    "Why did the researchers measure demands?",
    "Did the study have a control group?",
    "What are the main limitations of this study?",
    "Did the training improve students' grades?",
    "How was stress measured?",
    "Who benefited most from the training?",
    "What percentage of the students had little or no experience with time management?",
    "What does 'non-equivalent dependent variable design' mean in simple terms?",
    "On which page can I find the results for perceived control of time?",
    "Can I conclude that time management training reduces stress for all students?",
    "What did Pierceall and Keim find?",
    "What was the effect size for stress at four weeks?",
    "Did the students actually use the strategies after the training?"
];

const MODELS = [
    { id: "gpt-4o-mini", body: { model: "gpt-4o-mini", temperature: 0.5, max_tokens: 16384 } },   // production today
    { id: "gpt-5.4-mini", body: { model: "gpt-5.4-mini", temperature: 0.5, max_completion_tokens: 16384 } },
    { id: "gpt-5.5", body: { model: "gpt-5.5", max_completion_tokens: 16384, reasoning_effort: "low" } }
];

async function ask(m, q) {
    for (let attempt = 0; attempt < 4; attempt++) {
        const t0 = Date.now();
        try {
            const res = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
                body: JSON.stringify({ ...m.body, messages: [{ role: "system", content: system }, { role: "user", content: q }] })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(JSON.stringify(data.error).slice(0, 300));
            return { question: q, answer: data.choices[0].message.content, seconds: +((Date.now() - t0) / 1000).toFixed(1), usage: data.usage };
        } catch (e) {
            if (attempt === 3) return { question: q, error: String(e.message) };
            await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
        }
    }
}

(async () => {
    for (const m of MODELS) {
        const file = path.join(OUT, `${m.id}.json`);
        if (fs.existsSync(file)) continue;
        const answers = [];
        let next = 0;
        await Promise.all(Array.from({ length: 4 }, async () => {
            while (next < QUESTIONS.length) { const i = next++; answers[i] = await ask(m, QUESTIONS[i]); }
        }));
        fs.writeFileSync(file, JSON.stringify({ model: m.id, request: m.body, answers }, null, 1));
        const ok = answers.filter(a => !a.error);
        const secs = ok.map(a => a.seconds).sort((a, b) => a - b);
        console.log(`${m.id.padEnd(14)} ${ok.length}/${answers.length} answered, median ${secs[Math.floor(secs.length / 2)]}s, max ${secs[secs.length - 1]}s`
            + (ok.length < answers.length ? `  first error: ${answers.find(a => a.error).error}` : ""));
    }
})();
