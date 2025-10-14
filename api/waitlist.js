// /api/waitlist.js
// Works on Vercel (Serverless Function) and Next.js Pages API route.
// Requires ENV vars in Production: GMAIL_USER, GMAIL_APP_PASSWORD

import nodemailer from "nodemailer";

/* ------------------ Simple in-memory rate limit (per instance) ------------------ */
// 1 request / 10s per IP, max 10 per hour per IP
const TEN_SECONDS = 10_000;
const ONE_HOUR = 60 * 60 * 1000;
const lastHitByIp = new Map();   // ip -> last timestamp
const hourHitsByIp = new Map();  // ip -> [timestamps in last hour]

function getClientIp(req) {
  // Vercel/Proxies
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) {
    return xf.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function rateLimitOk(ip) {
  const now = Date.now();

  const last = lastHitByIp.get(ip) || 0;
  if (now - last < TEN_SECONDS) return false;
  lastHitByIp.set(ip, now);

  const arr = hourHitsByIp.get(ip) || [];
  const recent = arr.filter((t) => now - t < ONE_HOUR);
  recent.push(now);
  hourHitsByIp.set(ip, recent);
  return recent.length <= 10;
}

/* ----------------------------- CORS + helpers ----------------------------- */
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function send(res, status, payload) {
  setCors(res);
  res.setHeader("Content-Type", "application/json");
  res.status(status).json(payload);
}

/* ------------------------- Mail transporter (Gmail) ------------------------ */
const user = process.env.GMAIL_USER;
const pass = process.env.GMAIL_APP_PASSWORD;

let transporter = null;
if (user && pass) {
  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
} else {
  // Log once at cold start so you can see it in Vercel logs
  console.error("ENV_MISSING", {
    has_GMAIL_USER: !!user,
    has_GMAIL_APP_PASSWORD: !!pass,
  });
}

/* ------------------------------ Main handler ------------------------------ */
export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return send(res, 405, { ok: false, message: "Method not allowed" });
  }

  try {
    if (!transporter) {
      // Mirrors the Gmail library error you saw to make it obvious
      return send(res, 500, { ok: false, message: 'Missing credentials for "LOGIN"' });
    }

    // Parse body (Next.js automatically parses JSON; plain Vercel needs it sent as JSON)
    const { email, hp } = req.body || {};

    // Honeypot (bots will often fill this hidden field)
    if (typeof hp === "string" && hp.trim() !== "") {
      return send(res, 200, { ok: true, message: "Thanks!" });
    }

    // Basic email validation
    const emailStr = String(email || "").trim();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr);
    if (!emailOk) {
      return send(res, 400, { ok: false, message: "Please enter a valid email." });
    }

    // Rate limit
    const ip = getClientIp(req);
    if (!rateLimitOk(ip)) {
      return send(res, 429, { ok: false, message: "Too many requests. Try again later." });
    }

    // Compose email to your inbox (you can also write to DB here if you like)
    const html = `
      <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
        <h2>New Waitlist Signup</h2>
        <p><strong>Email:</strong> ${escapeHtml(emailStr)}</p>
        <p><small>IP: ${escapeHtml(ip)}</small></p>
        <hr />
        <p>KIDOOZA – Smarter Learning Powered by AI</p>
      </div>
    `;

    const info = await transporter.sendMail({
      from: `KIDOOZA <${user}>`,
      to: user,                  // send to your inbox
      replyTo: emailStr,         // so you can reply directly
      subject: `KIDOOZA waitlist: ${emailStr}`,
      text: `New waitlist signup: ${emailStr} (IP: ${ip})`,
      html,
    });

    // Optional: send a lightweight confirmation to the user
    // (Uncomment if you want to send confirmations)
    // await transporter.sendMail({
    //   from: `KIDOOZA <${user}>`,
    //   to: emailStr,
    //   subject: "You're on the KIDOOZA waitlist 🎉",
    //   text: "Thanks for joining our waitlist! We'll be in touch soon.",
    // });

    console.log("MAIL_OK", { messageId: info?.messageId });

    return send(res, 200, { ok: true, message: "Email sent successfully!" });
  } catch (err) {
    console.error("MAIL_ERROR", safeError(err));
    // Normalize common SMTP errors so they’re easy to read in the client console
    const msg =
      err?.response?.includes("Invalid login") ? "Invalid SMTP login" :
      err?.code === "EAUTH" ? "SMTP authentication failed" :
      "Internal Server Error";
    return send(res, 500, { ok: false, message: msg });
  }
}

/* --------------------------------- Utils --------------------------------- */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function safeError(e) {
  return {
    name: e?.name,
    code: e?.code,
    message: e?.message,
    response: e?.response,
    stack: e?.stack?.split("\n").slice(0, 3).join("\n"),
  };
}
