// KOTA MENTARI — peladen dev statis (Node 22, tanpa dependensi).
// Melayani folder game/ di http://localhost:8080 untuk playtest lokal.
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";
const ROOT = join(process.cwd(), "game");
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};
const server = createServer((req, res) => {
  const raw = decodeURIComponent(req.url || "/").split("?")[0];
  const path = raw === "/" ? "/index.html" : raw;
  const file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ""));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  let info;
  try {
    info = statSync(file);
  } catch (_e) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  if (!info.isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "content-length": info.size });
  createReadStream(file).pipe(res);
});
server.listen(PORT, () => {
  console.log("KOTA MENTARI dev server: http://localhost:" + PORT);
});
