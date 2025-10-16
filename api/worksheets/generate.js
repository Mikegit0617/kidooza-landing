// api/worksheets/generate.js
// M2.A — OpenAI-backed worksheet generator (JSON result)

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"; // small, cheap, good JSON
const MAX_COUNT = 20;

function bad(res, code, message) {
  res.status(code).json({ ok: false, message });
}

function sanitizeStr(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function validateRequest({ subject, grade, difficulty, count }) {
  const s = sanitizeStr(subject);
  const d = sanitizeStr(difficulty || "Easy");
  const g = Number(grade);
  let c = Number(count || 8);

  if (!s) throw new Error("Subject is required");
  if (!Number.isFinite(g) || g < 0 || g > 12) throw new Error("Grade must be 0–12");
  if (!["Easy", "Medium", "Hard"].includes(d)) throw new Error("Difficulty must be Easy/Medium/Hard");
  if (!Number.isFinite(c) || c < 1) c = 8;
  if (c > MAX_COUNT) c = MAX_COUNT;

  return { subject: s, grade: g, difficulty: d, count: c };
}

function validateWorksheet(w) {
  if (!w || typeof w !== "object") throw new Error("Invalid response shape");
  if (!Array.isArray(w.questions)) throw new Error("questions must be an array");
  w.title = sanitizeStr(w.title || "Worksheet");
  w.questions = w.questions
    .map((q) => ({ q: sanitizeStr(q?.q), a: sanitizeStr(q?.a) }))
    .filter((q) => q.q && q.a);
  w.answerKey = w.questions.map((q) => q.a);
  return w;
}

function buildFewShot(subject, grade, difficulty, count) {
  // One compact example to steer JSON shape; works for any subject
  return {
    role: "user",
    content:
      `Create ${count} ${difficulty} ${subject} questions for Grade ${grade}. ` +
      `Return strict JSON with keys: "title", "instructions" (one short sentence), ` +
      `"questions" (array of { "q": string, "a": string }), "answerKey" (array of strings). ` +
      `Rules: concise, age-appropriate, no external links, no code blocks, no explanations outside JSON.`
  };
}

module.exports = async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.status(200).end();
      return;
    }
    if (req.method !== "POST") {
      return bad(res, 405, "Method not allowed");
    }

    // -------- Parse request body --------
    let body = "";
    await new Promise((r) => {
      req.on("data", (c) => (body += c));
      req.on("end", r);
    });

    let payload = {};
    try { payload = body ? JSON.parse(body) : {}; }
    catch { return bad(res, 400, "Bad JSON"); }

    let { subject, grade, difficulty, count } = validateRequest(payload);

    // -------- Guardrails --------
    if (!process.env.OPENAI_API_KEY) {
      return bad(res, 500, "OPENAI_API_KEY missing");
    }

    console.log("WORKSHEET request", { subject, grade, difficulty, count });

    // -------- Call OpenAI (JSON output) --------
    const messages = [
      {
        role: "system",
        content:
          "You are KIDOOZA, an education assistant. Produce ONLY valid JSON. " +
          "Content must be accurate, age-appropriate, and concise."
      },
      buildFewShot(subject, grade, difficulty, count),
    ];

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages,
      }),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error("OPENAI_ERROR", r.status, t);
      return bad(res, 502, "Upstream AI error");
    }

    const comp = await r.json();
    const raw = comp?.choices?.[0]?.message?.content || "{}";

    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.error("JSON_PARSE_ERROR", e?.message, raw?.slice?.(0, 200));
      return bad(res, 502, "AI returned non-JSON");
    }

    // -------- Normalize/validate result --------
    let worksheet = validateWorksheet(data);

    // Trim to requested count if model returned more
    if (worksheet.questions.length > count) {
      worksheet.questions = worksheet.questions.slice(0, count);
      worksheet.answerKey = worksheet.questions.map((q) => q.a);
    }

    // -------- Respond (JSON) --------
    res.setHeader("Content-Type", "application/json");
    res.status(200).end(JSON.stringify({ ok: true, worksheet }));
  } catch (err) {
    console.error("WORKSHEET_ERROR", { name: err?.name, message: err?.message });
    return bad(res, 500, "Server error");
  }
};

