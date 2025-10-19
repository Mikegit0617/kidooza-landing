// /api/worksheets/pdf.js
const PDFDocument = require('pdfkit');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({ ok: false, message: 'Method not allowed' });
    }

    const {
      subject = 'Math',
      grade = 2,
      difficulty = 'Easy',
      count = 5,
      title = null,
      items = [],
      heroImageUrl = null,
      answers = []
    } = req.body || {};

    // Start headers before streaming
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="worksheet.pdf"');

    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 54, bottom: 54, left: 54, right: 54 }
    });

    // Stream PDF to the response
    doc.pipe(res);

    const MARGIN = doc.page.margins.left || 54;
    const HERO_SIZE = 64;

    // Optional hero image (must be absolute URL in prod)
    if (heroImageUrl) {
      try {
        const rImg = await fetch(heroImageUrl);
        if (rImg.ok) {
          const ab = await rImg.arrayBuffer();
          const imgBuf = Buffer.from(ab);
          const x = doc.page.width - MARGIN - HERO_SIZE;
          const y = MARGIN;
          doc.image(imgBuf, x, y, { fit: [HERO_SIZE, HERO_SIZE] });
        } else {
          console.warn('HERO_FETCH_FAIL', rImg.status, heroImageUrl);
        }
      } catch (e) {
        console.warn('HERO_FETCH_ERR', e.message);
      }
    }

    // Header
    doc.fontSize(20).text(title || `${subject} Worksheet`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Grade: ${grade}    Difficulty: ${difficulty}`, { align: 'center' });
    doc.moveDown(1);

    // Body
    if (Array.isArray(items) && items.length > 0) {
      items.forEach((q, i) => {
        doc.fontSize(12).text(`${i + 1}. ${q}`, { align: 'left' });
        doc.moveDown(0.4);
      });
    } else {
      for (let i = 1; i <= Number(count) || 5; i++) {
        doc.fontSize(12).text(`${i}. ________________________________`);
        doc.moveDown(0.5);
      }
    }

    // Answer key (optional)
    if (Array.isArray(answers) && answers.length > 0) {
      doc.addPage();
      doc.fontSize(18).text('Answer Key', { align: 'center' });
      doc.moveDown(1);
      answers.forEach((a, i) => {
        doc.fontSize(12).text(`${i + 1}. ${a}`, { align: 'left' });
        doc.moveDown(0.4);
      });
    }

    doc.end(); // finalize and flush stream
  } catch (err) {
    console.error('PDF ERROR', err);
    // If headers already sent, just destroy the stream
    if (res.headersSent) {
      try { res.end(); } catch (_) {}
      return;
    }
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
};
