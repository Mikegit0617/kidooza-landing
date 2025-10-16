// api/waitlist.js  (minimal test version)
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Method not allowed' });
      return;
    }

    // Read raw body (no body-parser in Vercel Node functions)
    let body = '';
    await new Promise((resolve) => {
      req.on('data', (chunk) => (body += chunk));
      req.on('end', resolve);
    });

    let data = {};
    try {
      data = body ? JSON.parse(body) : {};
    } catch {
      res.status(400).json({ ok: false, message: 'Bad JSON' });
      return;
    }

    const email = (data.email || '').trim();
    const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!okEmail) {
      res.status(400).json({ ok: false, message: 'Invalid email' });
      return;
    }

    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const ua = req.headers['user-agent'] || 'unknown';
    console.log('WAITLIST hit', { email, ip, ua, ts: new Date().toISOString() });

    res.setHeader('Content-Type', 'application/json');
    res.status(200).end(JSON.stringify({ ok: true, message: 'Received' }));
  } catch (err) {
    console.error('WAITLIST error', err);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
};
