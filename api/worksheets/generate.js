// api/worksheets/generate.js
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    const { subject = 'Math', grade = 2, difficulty = 'Easy', count = 5 } =
      (req.body || {});

    const n = Math.max(1, Math.min(20, Number(count) || 5));
    let title = `${subject} Worksheet`;
    let items = [];

    // --- Try OpenAI if possible, but DON'T fail the whole request if it errors ---
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (OPENAI_API_KEY) {
      try {
        const prompt = [
          `Create ${n} short ${difficulty} ${subject} questions for grade ${grade}.`,
          `Return strict JSON: {"title":"...","items":["Q1","Q2",...],"answers":["A1","A2",...]}.`,
        ].join(' ');

        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            temperature: 0.6,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: 'You produce clean JSON only.' },
              { role: 'user', content: prompt },
            ],
          }),
        });

        if (r.ok) {
          const data = await r.json();
          const content = data?.choices?.[0]?.message?.content || '{}';
          try {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed?.items) && parsed.items.length) {
              title = (parsed.title || title).toString().slice(0, 80);
              items = parsed.items.slice(0, n).map(x => String(x));
            }
          } catch (_) {
            // ignore parse error; we'll fall back below
          }
        } else {
          const text = await r.text().catch(() => '');
          console.warn('OPENAI_UPSTREAM_FAIL', r.status, text?.slice(0, 200));
        }
      } catch (err) {
        console.warn('OPENAI_CALL_ERR', err?.message);
      }
    } else {
      console.warn('OPENAI_API_KEY missing — using local fallback');
    }

    // --- Local fallback if OpenAI didn't deliver items ---
    if (!Array.isArray(items) || items.length === 0) {
      items = Array.from({ length: n }, (_, i) => `Question ${i + 1}`);
    }

    return res.status(200).json({
  ok: true,
  title,
  items,
  answers: [],
  meta: { subject, grade, difficulty, count: n },
  worksheet: { title, items, answers: [] }
});

