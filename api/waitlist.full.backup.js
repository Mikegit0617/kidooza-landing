// /api/waitlist.js  — works on Vercel, plain static site + serverless API.
// Path must be exactly /api/waitlist.js at repository root (for vercel.json routing, not needed).

import nodemailer from "nodemailer";

/* ------------------ CORS + helpers ------------------ */
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
function escapeHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

/* ------------------ Mailers ------------------ */
async function sendWithResend(toEmail, replyTo) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok:false, message:"RESEND_API_KEY missing" };

  const url = "https://api.resend.com/emails";
  const from = process.env.RESEND_FROM || "KIDOOZA <onboarding@resend.dev>"; // works without DNS
  const body = {
    from,
    to: [process.env.NOTIFY_TO || (process.env.GMAIL_USER || process.env.SMTP_USER) || toEmail],
    reply_to: replyTo || process.env.REPLY_TO || "hello@kidooza.ai",
    subject: `KIDOOZA waitlist: ${toEmail}`,
    html: `<div style="font-family:system-ui,Segoe UI,Roboto,Arial">
             <h2>New Waitlist Signup</h2>
             <p><b>Email:</b> ${escapeHtml(toEmail)}</p>
           </div>`
  };

  const r = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(()=>"");
    throw new Error(`RESEND_ERROR ${r.status}: ${t}`);
  }
  return { ok:true, message:"Email sent successfully! (Resend)" };
}

async function sendWithGmailSmtp(toEmail, replyTo) {
  const user = process.env.GMAIL_USER || process.env.SMTP_USER;
  const pass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;

  if (!user || !pass) {
    return { ok:false, message:'Missing credentials for "LOGIN"' };
  }

  const host   = process.env.SMTP_HOST || "smtp.gmail.com";
  const port   = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || "true") !== "false";

  const transporter = nodemailer.createTransport({
    host, port, secure,
    auth: { user, pass },
    authMethod: "PLAIN", // Gmail is fine with PLAIN over SSL; avoids auth mechanism mismatch
  });

  const html = `<div style="font-family:system-ui,Segoe UI,Roboto,Arial">
                  <h2>New Waitlist Signup</h2>
                  <p><b>Email:</b> ${escapeHtml(toEmail)}</p>
                </div>`;

  const info = await transporter.sendMail({
    from: `KIDOOZA <${user}>`,
    to: process.env.NOTIFY_TO || user,
    replyTo: replyTo || "hello@kidooza.ai",
    subject: `KIDOOZA waitlist: ${toEmail}`,
    text: `New waitlist signup: ${toEmail}`,
    html,
  });

  console.log("MAIL_OK", { id: info?.messageId });
  return { ok:true, message:"Email sent successfully!" };
}

/* ------------------ Handler ------------------ */
export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return send(res, 405, { ok:false, message:"Method not allowed" });

  try {
    const { email, hp } = req.body || {};
    if (typeof hp === "string" && hp.trim() !== "") return send(res, 200, { ok:true, message:"Thanks!" });
    const value = String(email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return send(res, 400, { ok:false, message:"Please enter a valid email." });

    // 1) Try Resend if key exists; 2) else Gmail SMTP
    if (process.env.RESEND_API_KEY) {
      const out = await sendWithResend(value, "hello@kidooza.ai");
      return send(res, out.ok ? 200 : 500, out);
    } else {
      const out = await sendWithGmailSmtp(value, "hello@kidooza.ai");
      return send(res, out.ok ? 200 : 500, out);
    }
  } catch (err) {
    const msg = (err?.message || "").includes("Invalid login") ? "Invalid SMTP login"
             : (err?.message || "").includes("authentication") ? "SMTP authentication failed"
             : "Internal Server Error";
    console.error("MAIL_ERROR", { msg, err: { name: err?.name, message: err?.message, stack: err?.stack?.split("\n").slice(0,3).join("\n") }});
    return send(res, 500, { ok:false, message: msg });
  }
}
