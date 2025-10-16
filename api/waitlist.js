// api/waitlist.js — Resend email enabled
module.exports = async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Method not allowed' });
      return;
    }

    // --- Parse body safely ---
    let body = '';
    await new Promise((resolve) => {
      req.on('data', (chunk) => (body += chunk));
      req.on('end', resolve);
    });
    let data = {};
    try { data = JSON.parse(body); } catch {
      res.status(400).json({ ok: false, message: 'Bad JSON' });
      return;
    }

    const email = (data.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ ok: false, message: 'Invalid email' });
      return;
    }

    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const ua = req.headers['user-agent'] || 'unknown';
    console.log('WAITLIST hit', { email, ip, ua, ts: new Date().toISOString() });

    // --- Send notification via Resend ---
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM || 'KIDOOZA <onboarding@resend.dev>';
    const to = process.env.NOTIFY_TO || 'hello@kidooza.ai';
    const replyTo = process.env.REPLY_TO || 'hello@kidooza.ai';

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: replyTo,
        subject: `KIDOOZA Waitlist: ${email}`,
        html: `
          <div style="font-family:system-ui,Segoe UI,Roboto,Arial">
            <h2>New Waitlist Signup</h2>
            <p><b>Email:</b> ${email}</p>
            <p style="color:#64748b">IP: ${ip}<br/>UA: ${ua}</p>
          </div>
        `,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error('RESEND_ERROR', resp.status, text);
      res.status(502).json({ ok: false, message: 'Email send failed' });
      return;
    }

    console.log('RESEND_SUCCESS', { email });
    res.status(200).json({ ok: true, message: 'Received' });
  } catch (err) {
    console.error('WAITLIST error', err);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
};
