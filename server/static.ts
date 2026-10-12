import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
};

/** Serves the built web app from rootDir. Never serves files outside it. */
export function serveStatic(rootDir: string) {
  const root = path.resolve(rootDir);

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end();
      return;
    }

    let filePath: string;
    try {
      const urlPath = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
      filePath = path.resolve(root, "." + (urlPath.endsWith("/") ? urlPath + "index.html" : urlPath));
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (!filePath.startsWith(root + path.sep)) {
      res.writeHead(404).end();
      return;
    }

    try {
      const body = await readFile(filePath);
      const ext = path.extname(filePath);
      res.writeHead(200, {
        "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        // index.html must not be cached so new builds show up; Vite hashes the other file names.
        ...(ext === ".html" ? { "cache-control": "no-cache" } : {}),
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    }
  };
}
