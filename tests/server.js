// Servidor estático mínimo para probar la app en local: `npm start` → http://localhost:8080
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png" };

function createServer() {
    return http.createServer((req, res) => {
        let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
        if (p.endsWith("/")) p += "index.html";
        const file = path.join(ROOT, p);
        if (!file.startsWith(ROOT) || file.includes("node_modules")) { res.writeHead(403); return res.end(); }
        fs.readFile(file, (err, data) => {
            if (err) { res.writeHead(404); return res.end("Not found"); }
            res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
            res.end(data);
        });
    });
}
module.exports = { createServer };
if (require.main === module) {
    const port = process.env.PORT || 8080;
    createServer().listen(port, () => console.log(`Seba FitPro en http://localhost:${port}`));
}
