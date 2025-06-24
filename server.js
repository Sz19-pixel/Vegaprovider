// server.js
import { createServer } from 'http';
import handler from './api/index.js'; // نفس Vercel-style handler

const PORT = process.env.PORT || 8080;

const server = createServer(async (req, res) => {
  try {
    await handler(req, res);
  } catch (e) {
    console.error('Server error:', e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Internal Server Error', message: e.message }));
  }
});

server.listen(PORT, () => {
  console.log(`✅ Railway server running at http://localhost:${PORT}`);
});
