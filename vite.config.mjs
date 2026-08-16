import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import worker from "./worker/index.js";

function resendDevApi(env) {
  return {
    name: "resend-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/requests", async (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405, { Allow: "POST", "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Method not allowed" }));
        }

        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const requestPath = req.url === "/" ? "/api/requests" : `/api/requests${req.url}`;
          const request = new Request(`http://localhost${requestPath}`, {
            method: req.method,
            headers: req.headers,
            body: Buffer.concat(chunks).toString(),
          });
          const response = await worker.fetch(request, {
            RESEND_API_KEY: env.RESEND_API_KEY,
            RESEND_FROM_EMAIL: env.RESEND_FROM_EMAIL,
          });
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(await response.text());
        } catch (error) {
          console.error("Local email request failed", error);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No s'ha pogut processar la sol·licitud." }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
    plugins: [react(), resendDevApi(env)],
  };
});
