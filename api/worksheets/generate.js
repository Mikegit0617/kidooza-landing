// /api/worksheets/generate.js
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    const { subject = 'Math', grade = 3, difficulty = 'Easy', count = 5 } = req.body || {};
    const n = Math.min(Math.max(parseInt(count, 10) || 5, 1), 20);

    const worksheet = {
      title: `${subject} Worksheet`,
      items: Array.from({ length: n }, (_, i) => `Question ${i + 1}`),
      answers: []
    };

    return res.status(200).json({ ok: true, worksheet, meta: { mode: 'stub' } });
  } catch (err) {
    console.error('STUB_GEN_ERR', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
};
