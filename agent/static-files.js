import { readFile } from "node:fs/promises";
import path from "node:path";

const routes = new Map([
  ["/", {
    fileName: "index.html",
    contentType: "text/html; charset=utf-8",
  }],
  ["/index.html", {
    fileName: "index.html",
    contentType: "text/html; charset=utf-8",
  }],
  ["/styles.css", {
    fileName: "styles.css",
    contentType: "text/css; charset=utf-8",
  }],
  ["/app.js", {
    fileName: "app.js",
    contentType: "text/javascript; charset=utf-8",
  }],
]);

export async function serveStaticFile({
  requestUrl,
  response,
  webDir,
}) {
  const url = new URL(requestUrl, "http://localhost");
  const route = routes.get(url.pathname);

  if (!route) {
    return false;
  }

  let content;

  try {
    content = await readFile(
      path.join(webDir, route.fileName),
    );
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }

    throw error;
  }

  response.writeHead(200, {
    "Content-Type": route.contentType,
    "Content-Length": content.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": [
      "default-src 'self'",
      "connect-src 'self'",
      "style-src 'self'",
      "script-src 'self'",
      "img-src 'self' data:",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join("; "),
  });

  response.end(content);
  return true;
}
