// api/ping.js
module.exports = async (req, res) => {
  try {
    console.log("PING hit", { method: req.method, ts: new Date().toISOString() });
    res.setHeader("Content-Type", "application/json");
    res.status(200).end(JSON.stringify({ ok: true, pong: Date.now() }));
  } catch (err) {
    console.error("PING error", err);
    res.status(500).end("error");
  }
};
