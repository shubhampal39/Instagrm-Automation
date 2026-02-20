import dotenv from "dotenv";

dotenv.config();

const env = process.env;

export const config = {
  port: Number(env.PORT || 4000),
  nodeEnv: env.NODE_ENV || "development",
  uploadDir: env.UPLOAD_DIR || "uploads",
  dataDir: env.DATA_DIR || "data",
  dbFile: env.DB_FILE || "posts.json",
  serverBaseUrl: env.SERVER_BASE_URL || "http://localhost:4000",
  openAiApiKey: env.OPENAI_API_KEY || "",
  openAiModel: env.OPENAI_MODEL || "gpt-4o-mini",
  instagramAccessToken: env.INSTAGRAM_ACCESS_TOKEN || "",
  instagramAccountId: env.INSTAGRAM_ACCOUNT_ID || "",
  publishMode: env.PUBLISH_MODE || "mock",
  autopilotEnabled: String(env.AUTOPILOT_ENABLED || "false").toLowerCase() === "true",
  autopilotIntervalMinutes: Math.max(30, Number(env.AUTOPILOT_INTERVAL_MINUTES || 180)),
  autopilotDelayMinutes: Math.max(5, Number(env.AUTOPILOT_DELAY_MINUTES || 60))
};

export function hasInstagramCredentials() {
  return Boolean(config.instagramAccessToken && config.instagramAccountId);
}
