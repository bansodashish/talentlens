import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The React app talks DIRECTLY to the Express backend (CORS-enabled) on
// port 8000. The previous proxy approach was unreliable under concurrent
// multipart uploads because Vite's http-proxy and HMR websocket competed
// for connections on the same port.

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  build: {
    outDir: "../static",
    emptyOutDir: true,
  },
});
