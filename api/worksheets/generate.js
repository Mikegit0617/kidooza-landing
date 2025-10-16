module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }

  let body = '';
  await new Promise((r) => { req.on('data', c => body += c); req.on('end', r); });
  const { subject, grade, difficulty, count } = JSON.parse(body || '{}');

  console.log('WORKSHEET request', { subject, grade, difficulty, count });
  res.status(200).json({ ok: true, message: 'Endpoint live' });
};
