import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// In local development, serve the Vercel function api/users.js at /api/users,
// so user management can be tested without the Vercel CLI.
function localApi(env) {
  return {
    name: "local-api",
    configureServer(server) {
      Object.assign(process.env, env);
      server.middlewares.use("/api/users", async (req, res) => {
        let body = "";
        for await (const chunk of req) body += chunk;
        req.body = body ? JSON.parse(body) : {};
        const shim = {
          status(code) { res.statusCode = code; return shim; },
          json(data) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data)); },
        };
        const { default: handler } = await server.ssrLoadModule("/api/users.js");
        await handler(req, shim);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return { plugins: [react(), localApi(env)] };
});
