const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const crypto = require("crypto");


// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

// Define API keys as secrets
const openaiApiKey = defineSecret("OPENAI_API_KEY");
const gmailUser = defineSecret("GMAIL_USER");
const gmailAppPassword = defineSecret("GMAIL_APP_PASSWORD");
const devAccessToken = defineSecret("DEV_ACCESS_TOKEN");
const geminiApiKey = defineSecret("GEMINI_API_KEY");

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Admin email for error notifications
const ADMIN_EMAIL = "bae.332@osu.edu";

// ---------------------------------------------------------------------------
// Sign-in links that never touch the Firebase auth domain
// ---------------------------------------------------------------------------
//
// generateSignInWithEmailLink() returns a URL on <project>.firebaseapp.com whose
// only job is to redirect to continueUrl with the same query string. For a
// brand-new project that hop is a brand-new domain, and Microsoft 365 (which
// @osu.edu runs on) quarantines mail linking to domains it has never seen --
// the message reaches the Gmail Sent folder and never arrives. login.html
// already handles the post-redirect URL shape, so build that URL directly and
// the only domain in the email is github.io.
function directSignInLink(firebaseLink, continueUrl) {
  const src = new URL(firebaseLink);
  const oobCode = src.searchParams.get("oobCode");
  if (!oobCode) return firebaseLink;                 // unexpected shape; fall back
  const out = new URL(continueUrl);
  out.searchParams.set("mode", "signIn");
  out.searchParams.set("oobCode", oobCode);
  out.searchParams.set("apiKey", src.searchParams.get("apiKey") || "");
  out.searchParams.set("lang", src.searchParams.get("lang") || "en");
  return out.toString();
}

// Helper function to send error notification email
async function sendErrorNotification(subject, errorDetails, userEmail = null) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser.value(),
        pass: gmailAppPassword.value()
      }
    });

    const timestamp = new Date().toISOString();
    const mailOptions = {
      from: `"UG Reading Study" <${gmailUser.value()}>`,
      to: ADMIN_EMAIL,
      subject: `[Error] ${subject}`,
      html: `
        <h2>Error Notification</h2>
        <p><strong>Time:</strong> ${timestamp}</p>
        ${userEmail ? `<p><strong>User:</strong> ${userEmail}</p>` : ""}
        <h3>Error Details:</h3>
        <pre style="background: #f5f5f5; padding: 10px; border-radius: 5px;">${errorDetails}</pre>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Error notification sent to ${ADMIN_EMAIL}`);
  } catch (emailError) {
    console.error("Failed to send error notification:", emailError);
  }
}

// Helper function for API calls with retry logic (for rate limits)
async function fetchWithRetry(url, options, maxRetries = 3, baseDelayMs = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);

    if (response.ok) {
      return response;
    }

    // Retry on rate limit (429) or transient upstream overload (503)
    if ((response.status === 429 || response.status === 503) && attempt < maxRetries) {
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
      console.log(`${response.status} received. Retrying in ${delayMs / 1000}s (attempt ${attempt}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      continue;
    }

    // For other errors or final attempt, return the response
    return response;
  }
}

// OpenAI Chat Completion Proxy
exports.chatCompletion = onRequest(
  {
    secrets: [openaiApiKey]
  },
  async (req, res) => {
    // Set CORS headers for all responses
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    // Handle preflight
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const { messages, model = "gpt-4o-mini", max_tokens = 200, temperature = 0.7 } = req.body;

      if (!messages || !Array.isArray(messages)) {
        res.status(400).json({ error: "messages array is required" });
        return;
      }

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiApiKey.value()}`
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens,
          temperature
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("OpenAI API error:", error);
        res.status(response.status).json({ error: "OpenAI API error", details: error });
        return;
      }

      const data = await response.json();
      res.json(data);

    } catch (error) {
      console.error("Proxy error:", error);
      res.status(500).json({ error: "Internal server error", message: error.message });
    }
  }
);

// Generate Podcast from PDF
// This function takes PDF content, generates a script, and returns TTS audio
exports.sendLoginEmail = onRequest(
  {
    cors: true,
    secrets: [gmailUser, gmailAppPassword],
    timeoutSeconds: 30,
    memory: "256MiB"
  },
  async (req, res) => {
    // Handle preflight
    if (req.method === "OPTIONS") {
      res.set(corsHeaders);
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const { email } = req.body;

      if (!email) {
        res.status(400).json({ error: "email is required" });
        return;
      }

      console.log(`Generating sign-in link for ${email}`);

      // Generate sign-in link using Firebase Admin SDK
      const actionCodeSettings = {
        url: 'https://bae4147.github.io/study-ug/login.html',
        handleCodeInApp: true
      };

      const signInLink = directSignInLink(
        await admin.auth().generateSignInWithEmailLink(email, actionCodeSettings),
        actionCodeSettings.url
      );

      console.log("Sign-in link generated successfully");

      // Create email transporter
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: gmailUser.value(),
          pass: gmailAppPassword.value()
        }
      });

      // Build email HTML content
      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { display: inline-block; background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
    .button:hover { background: #1d4ed8; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <h1>📖 Sign in to Reading Assignment</h1>

  <p>Hello,</p>

  <p>Click the button below to sign in to your reading assignment:</p>

  <a href="${signInLink}" class="button" style="display:inline-block;background:#2563eb;color:#ffffff !important;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:bold;margin:20px 0;"><span style="color:#ffffff !important;">Sign In</span></a>

  <p>Or copy and paste this link into your browser:</p>
  <p style="word-break: break-all; color: #2563eb; font-size: 14px;">${signInLink}</p>

  <p><strong>Note:</strong> This link will expire in 1 hour and can only be used once.</p>

  <div class="footer">
    <p>If you didn't request this email, you can safely ignore it.</p>
  </div>
</body>
</html>
      `;

      // Send email
      const mailOptions = {
        from: `"UG Reading Study" <${gmailUser.value()}>`,
        to: email,
        subject: "Sign in to Reading Assignment",
        html: emailHtml
      };

      await transporter.sendMail(mailOptions);

      console.log(`✅ Login email sent to ${email}`);

      res.set(corsHeaders);
      res.json({
        success: true,
        message: `Email sent to ${email}`
      });

    } catch (error) {
      console.error("Login email error:", error);
      res.status(500).json({ error: "Failed to send email", message: error.message });
    }
  }
);

// Send Completion Email with student's responses
exports.sendCompletionEmail = onRequest(
  {
    cors: true,
    secrets: [gmailUser, gmailAppPassword],
    timeoutSeconds: 30,
    memory: "256MiB"
  },
  async (req, res) => {
    // Handle preflight
    if (req.method === "OPTIONS") {
      res.set(corsHeaders);
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const { uid, sessionId } = req.body;

      if (!uid || !sessionId) {
        res.status(400).json({ error: "uid and sessionId are required" });
        return;
      }

      console.log(`Sending completion email for user ${uid}, session ${sessionId}`);

      // Fetch user profile and session data from Firestore
      const db = admin.firestore();

      const [userDoc, sessionDoc] = await Promise.all([
        db.collection("users").doc(uid).get(),
        db.collection("users").doc(uid).collection("sessions").doc(sessionId).get()
      ]);

      if (!userDoc.exists || !sessionDoc.exists) {
        res.status(404).json({ error: "User or session not found" });
        return;
      }

      // The mail is a bare confirmation of participation: it carries none of the
      // answers, so nothing is read out of the session beyond the address.
      const recipientEmail = userDoc.data().email;

      // Create email transporter
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: gmailUser.value(),
          pass: gmailAppPassword.value()
        }
      });

      // Build email HTML content
      const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="font-size: 22px;">Reading study completed</h1>
  <p>This email confirms that you completed the reading study. Nothing further is
     needed from you. Thank you for taking part.</p>
  <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">
    <p>Questions about the study? Reply to this email or contact <a href="mailto:bae.332@osu.edu" style="color:#6b7280;">bae.332@osu.edu</a>.</p>
  </div>
</body>
</html>
      `;

      const mailOptions = {
        from: `"UG Reading Study" <${gmailUser.value()}>`,
        to: recipientEmail,
        subject: "Reading study: completed",
        html: emailHtml
      };

      await transporter.sendMail(mailOptions);

      console.log(`✅ Completion email sent to ${recipientEmail}`);

      res.set(corsHeaders);
      res.json({
        success: true,
        message: `Email sent to ${recipientEmail}`
      });

    } catch (error) {
      console.error("Email sending error:", error);
      res.status(500).json({ error: "Failed to send email", message: error.message });
    }
  }
);

// ---------------------------------------------------------------------------
// ingestEvents — the pagehide beacon lands here
// ---------------------------------------------------------------------------
// A Firestore write started while the tab is closing does not finish; a
// sendBeacon does. The beacon cannot carry an auth header, so it proves itself
// with the per-session token the client wrote into the session document.
exports.ingestEvents = onRequest({ cors: true }, async (req, res) => {
  if (req.method === "OPTIONS") { res.set(corsHeaders); res.status(204).send(""); return; }
  try {
    const { uid, sessionId, beaconToken, batchSeq, points, intervals } = req.body || {};
    if (!uid || !sessionId || !beaconToken) { res.status(400).json({ error: "Malformed beacon" }); return; }

    const sessionRef = admin.firestore().doc(`users/${uid}/sessions/${sessionId}`);
    const snap = await sessionRef.get();
    if (!snap.exists) { res.status(404).json({ error: "Unknown session" }); return; }

    const expected = Buffer.from(String(snap.data().beaconToken || ""));
    const given = Buffer.from(String(beaconToken));
    if (!expected.length || expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
      res.status(403).json({ error: "Bad beacon token" }); return;
    }

    const batchId = `${String(batchSeq || 0).padStart(5, "0")}-beacon-${crypto.randomBytes(3).toString("hex")}`;
    await sessionRef.collection("eventBatches").doc(batchId).set({
      batchSeq: batchSeq || 0, writtenAt: Date.now(), viaBeacon: true, final: true,
      points: points || [], intervals: intervals || []
    });
    res.set(corsHeaders); res.json({ ok: true });
  } catch (error) {
    console.error("ingestEvents error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// devLogin — sign in without receiving an email (testing only)
// ---------------------------------------------------------------------------
exports.devLogin = onRequest({ cors: true, secrets: [devAccessToken] }, async (req, res) => {
  if (req.method === "OPTIONS") { res.set(corsHeaders); res.status(204).send(""); return; }
  try {
    const { token, email, continueUrl } = req.body || {};
    const want = Buffer.from(String(devAccessToken.value() || ""));
    const got = Buffer.from(String(token || ""));
    if (!want.length || want.length !== got.length || !crypto.timingSafeEqual(want, got)) {
      res.status(403).json({ error: "Bad access token" }); return;
    }
    const address = String(email || "").trim().toLowerCase();
    try { await admin.auth().getUserByEmail(address); }
    catch (e) { await admin.auth().createUser({ email: address, emailVerified: true }); }
    const target = String(continueUrl || "https://bae4147.github.io/study-ug/login.html");
    const link = directSignInLink(
      await admin.auth().generateSignInWithEmailLink(address, { url: target, handleCodeInApp: true }),
      target
    );
    res.set(corsHeaders); res.json({ ok: true, link, email: address });
  } catch (error) {
    console.error("devLogin error:", error);
    res.status(500).json({ error: error.message });
  }
});


// ---------------------------------------------------------------------------
// generateCustom — the one regeneration a customisation arm is allowed
// ---------------------------------------------------------------------------
// The work outlives an HTTP response: a video is minutes of image and speech
// calls, and a request held open that long is at the mercy of every proxy
// between here and the reader. So the browser fires this and then watches a job
// document instead — which is also what makes cancelling and reloading work.
//
//   users/{uid}/sessions/{sid}/customJobs/{modality}
//     status    queued | running | done | error | aborted
//     step/done/total   what to draw in the progress line
//     url/urls  where the finished media landed
//     aborted   set by the browser; this function checks it between steps
//
// Cancelling has to be a flag the function reads, not a closed connection:
// dropping the request would leave the work running and still billable.

const MODALITIES = ["video", "audio", "infographic"];

// Which arms may regenerate. Kept here as well as in docs/conditions.js because
// a browser check is advice; this is the one that decides.
const CUSTOMISING_CONDITIONS = ["mm_cimo_custom", "mm_chat_custom"];

async function publicUpload(buffer, destination, contentType) {
  const file = admin.storage().bucket().file(destination);
  await file.save(buffer, { contentType, metadata: { cacheControl: "public, max-age=31536000" } });
  await file.makePublic();
  return `https://storage.googleapis.com/${admin.storage().bucket().name}/${destination}`;
}

exports.generateCustom = onRequest(
  {
    cors: true,
    secrets: [openaiApiKey, geminiApiKey],
    timeoutSeconds: 540,
    memory: "1GiB"
  },
  async (req, res) => {
    if (req.method === "OPTIONS") { res.set(corsHeaders); res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
    res.set(corsHeaders);

    const gen = require("./generation");
    let jobRef = null;

    try {
      const { sessionId, modality, focus = "", length = "default" } = req.body || {};

      // This endpoint spends money, so unlike the others it insists on knowing
      // who is calling rather than taking a uid on trust.
      const authHeader = req.get("Authorization") || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (!token) { res.status(401).json({ error: "Sign-in required" }); return; }
      const uid = (await admin.auth().verifyIdToken(token)).uid;

      if (!sessionId || !MODALITIES.includes(modality)) {
        res.status(400).json({ error: "sessionId and a known modality are required" });
        return;
      }

      const db = admin.firestore();
      const sessionRef = db.collection("users").doc(uid).collection("sessions").doc(sessionId);
      const sessionSnap = await sessionRef.get();
      if (!sessionSnap.exists) { res.status(404).json({ error: "No such session" }); return; }

      const condition = sessionSnap.data().condition;
      if (!CUSTOMISING_CONDITIONS.includes(condition)) {
        res.status(403).json({ error: "This condition does not include customisation" });
        return;
      }

      jobRef = sessionRef.collection("customJobs").doc(modality);

      // One chance per modality. A run that failed or was cancelled does not
      // count -- the reader should not lose their turn to our outage -- so only
      // a finished one closes the door.
      const existing = await jobRef.get();
      if (existing.exists && existing.data().status === "done") {
        res.status(409).json({ error: "Already used for this modality" });
        return;
      }
      if (existing.exists && existing.data().status === "running") {
        res.status(409).json({ error: "Already running" });
        return;
      }

      const startedAt = Date.now();
      await jobRef.set({
        status: "running",
        modality,
        focus: String(focus || "").slice(0, gen.MAX_FOCUS_CHARS),
        length: modality === "video" ? length : null,
        condition,
        aborted: false,
        step: "starting",
        message: "Starting",
        done: 0,
        total: 0,
        startedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Answer now. The work carries on; the browser follows the job document.
      res.json({ ok: true, modality });

      const keys = { openai: openaiApiKey.value(), gemini: geminiApiKey.value() };

      // Progress is worth showing but not worth a write per scene per second.
      let lastWrite = 0;
      const onProgress = (p) => {
        const now = Date.now();
        if (now - lastWrite < 1500 && p.done !== p.total) return;
        lastWrite = now;
        jobRef.set({
          step: p.step || null,
          message: p.message || null,
          done: p.done || 0,
          total: p.total || 0
        }, { merge: true }).catch(() => {});
      };

      let cancelled = false;
      let lastCheck = 0;
      const isAborted = () => {
        const now = Date.now();
        if (now - lastCheck > 3000) {
          lastCheck = now;
          jobRef.get().then(s => { if (s.exists && s.data().aborted) cancelled = true; }).catch(() => {});
        }
        return cancelled;
      };

      const stamp = `${uid}/${sessionId}/${modality}-${startedAt}`;
      const opts = { keys, focus, onProgress, isAborted };

      if (modality === "infographic") {
        const r = await gen.generateInfographic(opts);
        const ext = r.contentType.includes("jpeg") ? "jpg" : "png";
        const url = await publicUpload(r.image, `custom/${stamp}.${ext}`, r.contentType);
        await jobRef.set({ status: "done", url, finishedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

      } else if (modality === "audio") {
        const r = await gen.generateAudio(opts);
        const url = await publicUpload(r.audio, `custom/${stamp}.mp3`, "audio/mpeg");
        await jobRef.set({ status: "done", url, script: r.script, finishedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

      } else {
        const r = await gen.generateVideo({ ...opts, length });
        // A slideshow is far past the 1 MB a Firestore document holds, so the
        // scenes go to storage as files and the job keeps only their addresses.
        const scenes = [];
        for (const sc of r.scenes) {
          const n = String(sc.sceneNumber).padStart(2, "0");
          const [image, audio] = await Promise.all([
            publicUpload(Buffer.from(sc.imageBase64, "base64"), `custom/${stamp}/scene${n}.png`, "image/png"),
            publicUpload(Buffer.from(sc.audioBase64, "base64"), `custom/${stamp}/scene${n}.mp3`, "audio/mpeg")
          ]);
          scenes.push({ sceneNumber: sc.sceneNumber, image, audio, duration: sc.duration, narration: sc.narration });
        }
        await jobRef.set({
          status: "done",
          title: r.title,
          scenes,
          finishedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }

      console.log(`✅ custom ${modality} for ${uid} in ${Math.round((Date.now() - startedAt) / 1000)}s`);

    } catch (error) {
      const aborted = error && error.aborted;
      console.error(aborted ? "custom generation cancelled" : "custom generation failed:", error.message);
      if (jobRef) {
        await jobRef.set({
          status: aborted ? "aborted" : "error",
          error: aborted ? null : String(error.message).slice(0, 500),
          finishedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).catch(() => {});
      }
      if (!res.headersSent) res.status(500).json({ error: "Generation failed" });
    }
  }
);
