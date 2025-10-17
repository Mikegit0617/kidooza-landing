// api/worksheets/pdf.js
// Generates a printable PDF worksheet from OpenAI output.
// Works on Vercel. Requires env: OPENAI_API_KEY

const PDFDocument = require('pdfkit');

function bad(res, code, message) {
  res.status(code).json({ ok: false, message });
}

function parseJsonSafe(text) {
  try { return JSON.parse(text); } catch { return null; }
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return bad(res, 405, 'Method not allowed');

    // Read JSON body
    let raw = '';
    await new Promise((resolve) => {
      req.on('data', c => raw += c);
      req.on('end', resolve);
    });

    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch {
      return bad(res, 400, 'Bad JSON');
    }

    const subject    = String(body.subject || 'Math');
    const grade      = Number(body.grade || 2);
    const difficulty = String(body.difficulty || 'Easy');
    const count      = Math.min(50, Math.max(1, Number(body.count || 10)));

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return bad(res, 500, 'Missing OPENAI_API_KEY');

    // --- Ask OpenAI to craft a worksheet in JSON (title, instructions, problems[{question,answer}])
    const prompt = `
You are a K-8 worksheet generator. Make a printable worksheet.

Return JSON ONLY with this exact shape:
{
  "title": string,
  "instructions": string,
  "problems": [{"question": string, "answer": string}]
}

Constraints:
- Subject: ${subject}
- Grade: ${grade}
- Difficulty: ${difficulty}
- Problems: ${count}
- Keep questions concise; age-appropriate; no numbering in the JSON (we'll number in the PDF).
- Answers should be short and exact (for answer key).
`;

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',              // good quality & cost; switch to gpt-4o-mini to save more
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You create safe, age-appropriate K-8 worksheets.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.error('OPENAI_ERROR', r.status, txt);
      return bad(res, 502, 'Upstream AI error');
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    const ws = parseJsonSafe(content);

    if (!ws || !Array.isArray(ws.problems)) {
      console.error('PARSE_ERROR content=', content?.slice?.(0, 300));
      return bad(res, 500, 'AI response parse error');
    }

    // --- Build the PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="worksheet.pdf"');

    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 54, bottom: 54, left: 54, right: 54 }
    });

    // Pipe PDF to response
    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Times-Bold').text(ws.title || `${subject} Worksheet`, { align: 'center' });
    doc.moveDown(0.25);
    doc.fontSize(10).font('Times-Roman')
       .text(`Subject: ${subject}   Grade: ${grade}   Difficulty: ${difficulty}`, { align: 'center' });
    doc.moveDown(0.5);
    if (ws.instructions) {
      doc.fontSize(12).text(ws.instructions);
      doc.moveDown(0.75);
    } 
    
  } catch (err) {
    console.error('PDF_HANDLER_ERROR', { name: err?.name, message: err?.message });
    return bad(res, 500, 'Server error');
  }
};
