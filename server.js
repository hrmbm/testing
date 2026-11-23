import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

app.use((req, res, next) => {
  if (req.path === '/form' || req.path.startsWith('/form/') || req.path === '/sw.js') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  }
  next();
});

app.get('/vendor/xlsx.mjs', (_req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'node_modules', 'xlsx', 'xlsx.mjs'));
});

app.use((req, res, next) => {
  const blocked = ['/server.js', '/package.json', '/package-lock.json'];
  if (blocked.includes(req.path)) {
    return res.status(404).sendFile(path.join(__dirname, '404.html'));
  }
  next();
});

app.use(express.static(__dirname, {
  extensions: ['html'],
  redirect: true,
}));

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`HR&GA Workspace static server listening on http://${HOST}:${PORT}`);
});
