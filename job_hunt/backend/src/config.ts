/**
 * config.ts — Load .env files from the workspace root before anything else.
 * Mirrors the Python config.py load_env_files() behaviour:
 *   • .env is loaded first (takes priority)
 *   • .env.example fills in any keys that are still missing
 *   • Neither file overrides variables already set in the process environment
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// backend/src/ → backend/ → job_hunt/ (workspace root)
export const ROOT = resolve(__dirname, "../../");

config({ path: resolve(ROOT, ".env") });
config({ path: resolve(ROOT, ".env.example") });
// Also allow a backend-local .env for overrides
config({ path: resolve(ROOT, "backend", ".env") });

// Honour the Python flag for skipping SSL verification
if (
  process.env.DISABLE_SSL_VERIFY === "true" ||
  process.env.AFFINDA_SSL_VERIFY?.toLowerCase() === "false"
) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}
