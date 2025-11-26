// Lightweight SSE broadcaster
const clients = new Set();

function initSSE(app) {
  app.get("/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    // Initial ping
    res.write(`event: ping\ndata: "ready"\n\n`);

    // Heartbeat to keep the connection alive (some proxies close idle streams)
    const heartbeat = setInterval(() => {
      try {
        res.write(`event: ping\ndata: "keepalive"\n\n`);
      } catch (_) {
        // If write fails, connection likely closed; cleanup happens below
      }
    }, 30000);

    clients.add(res);
    req.on("close", () => {
      clients.delete(res);
      clearInterval(heartbeat);
    });
  });
}

function broadcast(type, data) {
  const payload = `event: message\ndata: ${JSON.stringify({ type, data })}\n\n`;
  for (const c of clients) {
    try {
      c.write(payload);
    } catch {}
  }
}

module.exports = { initSSE, broadcast };