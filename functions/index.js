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

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
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

  <a href="${signInLink}" class="button">Sign In</a>

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

      const userData = userDoc.data();
      const sessionData = sessionDoc.data();

      const recipientEmail = userData.email;
      const recipientName = userData.fullName || "Student";
      const paperTitle = sessionData.paperMetadata?.title || "Your Reading Assignment";

      // Extract post-task responses
      const postTask = sessionData.postTask || {};
      const contextTranslation = postTask.contextTranslation || [];
      const strategies = postTask.strategies || [];
      const newStrategyConfidence = postTask.newStrategyConfidence;
      const implementationLikelihood = postTask.implementationLikelihood;

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
    h1 { color: #2563eb; }
    h2 { color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; margin-top: 30px; }
    .response-box { background: #f9fafb; border-left: 4px solid #2563eb; padding: 15px; margin: 10px 0; }
    .rating { background: #ecfdf5; padding: 10px 15px; border-radius: 8px; display: inline-block; margin: 5px 0; }
    ul { padding-left: 20px; }
    li { margin: 8px 0; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <h1>📚 Your Reading Study Summary</h1>

  <p>Hi ${recipientName},</p>

  <p>Thank you for completing the reading assignment! Here's a summary of your responses for your records.</p>

  <p><strong>Paper:</strong> ${paperTitle}</p>
  <p><strong>Completed:</strong> ${new Date().toLocaleString("en-US", { timeZone: "America/New_York", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })} (ET)</p>

  <h2>Q1. Context Differences</h2>
  <p><em>Key differences between the research context and your own situation:</em></p>
  ${contextTranslation.length > 0 ? `
    <ul>
      ${contextTranslation.map(item => `<li class="response-box">${item}</li>`).join("")}
    </ul>
  ` : "<p><em>No responses recorded</em></p>"}

  <h2>Q2. Practical Takeaways</h2>
  <p><em>What you could realistically implement or test in your workplace:</em></p>
  ${strategies.length > 0 ? `
    <ul>
      ${strategies.map((item, idx) => `<li class="response-box"><strong>${idx + 1}.</strong> ${item}</li>`).join("")}
    </ul>
  ` : "<p><em>No responses recorded</em></p>"}

  <h2>Self-Assessment</h2>
  ${newStrategyConfidence ? `
    <p><strong>Confidence in takeaways being effective:</strong></p>
    <div class="rating">⭐ ${newStrategyConfidence} / 7</div>
  ` : ""}
  ${implementationLikelihood ? `
    <p><strong>Likelihood to implement changes:</strong></p>
    <div class="rating">📊 ${implementationLikelihood} / 7</div>
  ` : ""}

  <div class="footer">
    <p>This email was automatically generated as part of the reading study.</p>
    <p>If you have any questions, please contact your instructor.</p>
  </div>
</body>
</html>
      `;

      // Send email
      const mailOptions = {
        from: `"UG Reading Study" <${gmailUser.value()}>`,
        to: recipientEmail,
        subject: `Your Reading Study Summary: ${paperTitle}`,
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
