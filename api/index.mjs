/**
 * Vercel serverless entry — reuses the production Express bundle.
 * All /api/* requests are rewritten here by vercel.json.
 */
import app from "../artifacts/api-server/dist/index.mjs";

export default app;
