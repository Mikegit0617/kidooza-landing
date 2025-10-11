// /api/waitlist.js
const nodemailer = require('nodemailer');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    const { email } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, message: 'Valid email is required' });
    }

    // 🔹 These two lines MUST exist and match your Vercel env var names:
    const user = process.env.GMAIL_USER;          // <-- should be "hello@kidooza.ai"
    const pass = process.env.GMAIL_APP_PASSWORD;  // <-- your 16-char app password

    // Outlook / Microsoft 365 SMTP
    const transporter = nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,           // STARTTLS on port 587
      auth: { user, pass },    // 🔹 uses the env vars above
      requireTLS: true,
      tls: { rejectUnauthorized: true }
    });

    // Optional: verifies the SMTP connection/creds
    await transporter.verify();

    const info = await transporter.sendMail({
      from: `"Kidooza Waitlist" <${user}>`,  // 🔹 from must match the authenticated user
      to: 'hello@kidooza.ai',
      replyTo: email,
      subject: 'New Waitlist Signup',
      text: `New signup: ${email}`,
      html: `<p><strong>New signup:</strong> ${email}</p>`,
    });

    console.log('Mail sent:', info?.messageId || info);
    return res.status(200).json({ ok: true, message: 'Email sent' });
  } catch (err) {
    console.error('Email error:', err);
    return res.status(500).json({ ok: false, message: String(err?.message || err) });
  }
};
