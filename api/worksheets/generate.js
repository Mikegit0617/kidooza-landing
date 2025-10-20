// /api/worksheets/generate.js
import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const { subject = "Math", grade = 3, difficulty = "Easy", count = 5, demo } = req.body || {};

  // Demo fallback
  if (demo) {
    return res.status(200).json({
      ok: true,
      worksheet: {
        title: `${subject} Worksheet`,
        items: Array.from({ length: count }, (_, i) => `Question ${i + 1}: simple demo`),
        answers: [],
      },
      meta: { mode: "demo" },
    });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const prompt = `Generate ${count} ${difficulty} ${subject} questions for Grade ${grade} students. 
    Format JSON: { "title": "...", "items": ["Q1","Q2",...], "answers": ["A1","A2",...] }.`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    const worksheet = JSON.parse(content);

    return res.status(200).json({ ok: true, worksheet, meta: { mode: "ai" } });
  } catch (err) {
    console.error("GEN_ERR", err);
    return res.status(500).json({ ok: false, message: "Generation failed", error: err.message });
  }
}
