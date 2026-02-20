import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { v4 as uuidv4 } from "uuid";
import { config } from "./config.js";
import { optimizeCaption } from "./captionAgent.js";
import { upsertPost } from "./storage.js";

let intervalRef = null;

const state = {
  enabled: config.autopilotEnabled,
  running: false,
  lastRunAt: "",
  lastPostId: "",
  lastError: "",
  nextRunAt: ""
};

function fallbackCaption() {
  const hooks = [
    "Tiny smiles. Big emotions.",
    "10 seconds of pure baby joy.",
    "Cutest moment of the day unlocked.",
    "Soft vibes. Strong engagement.",
    "Baby energy that melts the feed."
  ];
  const pick = hooks[Math.floor(Math.random() * hooks.length)];
  return `${pick}\n\n#BabyReels #CuteBaby #ReelItFeelIt #InstaIndia #ViralReels #DailyReels #TrendingNow #GrowthMode`;
}

async function generateCaption() {
  const basePrompt =
    "Write a short, high-engagement Instagram caption for a 10-second animated baby reel. Keep it under 140 characters plus 8 relevant hashtags for India audience and viral reach.";
  const optimized = await optimizeCaption(basePrompt);
  return (optimized || fallbackCaption()).slice(0, 2200);
}

function runFfmpeg(outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=#ffe5ec:s=720x1280:d=10",
      "-vf",
      "drawbox=x='(w-200)/2+sin(t*2.2)*90':y='(h-200)/2+cos(t*1.9)*120':w=200:h=200:color=#ffffff@0.92:t=fill,drawbox=x='(w-110)/2+sin(t*3.1)*160':y='h*0.74+cos(t*2.5)*75':w=110:h=110:color=#ffb3c6@0.8:t=fill",
      "-r",
      "24",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "30",
      "-maxrate",
      "1200k",
      "-bufsize",
      "2400k",
      outputPath
    ];

    const child = spawn("ffmpeg", args, { stdio: "ignore" });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) return resolve();
      return reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

async function generateBabyReelAsset() {
  const outputDir = path.join(process.cwd(), config.uploadDir);
  await fs.mkdir(outputDir, { recursive: true });
  const filename = `${Date.now()}-autopilot-baby-reel.mp4`;
  const absOutput = path.join(outputDir, filename);
  await runFfmpeg(absOutput);
  return {
    mediaPath: `${config.uploadDir}/${filename}`,
    mediaOriginalName: filename
  };
}

async function createAutopilotPost() {
  const asset = await generateBabyReelAsset();
  const caption = await generateCaption();
  const now = Date.now();
  const scheduleAt = new Date(now + config.autopilotDelayMinutes * 60 * 1000).toISOString();

  const post = {
    id: uuidv4(),
    postType: "REEL",
    source: "AUTOPILOT_AGENT",
    autoCommentEnabled: true,
    commentPool: [
      "Would you watch part 2?",
      "Rate this reel from 1 to 10.",
      "More baby reels coming soon."
    ],
    autoCommentPosted: false,
    autoCommentMessage: "",
    autoCommentId: "",
    autoCommentError: "",
    scheduledCommentEnabled: false,
    scheduledCommentText: "",
    scheduledCommentAt: "",
    scheduledCommentStatus: "NONE",
    scheduledCommentId: "",
    scheduledCommentError: "",
    scheduledCommentPostedAt: "",
    caption,
    optimizedCaption: caption,
    mediaPath: asset.mediaPath,
    mediaOriginalName: asset.mediaOriginalName,
    scheduledAt: scheduleAt,
    status: "SCHEDULED",
    publishMode: "",
    remotePostId: "",
    error: "",
    publishedAt: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await upsertPost(post);
  return post;
}

async function runCycle() {
  if (state.running) return;
  state.running = true;
  state.lastError = "";
  try {
    const post = await createAutopilotPost();
    state.lastPostId = post.id;
    state.lastRunAt = new Date().toISOString();
  } catch (error) {
    state.lastError = error?.message || "Autopilot cycle failed";
    state.lastRunAt = new Date().toISOString();
  } finally {
    state.running = false;
    state.nextRunAt = new Date(Date.now() + config.autopilotIntervalMinutes * 60 * 1000).toISOString();
  }
}

export function getAutopilotStatus() {
  return { ...state };
}

export async function runAutopilotNow() {
  await runCycle();
  return getAutopilotStatus();
}

export function triggerAutopilotNow() {
  if (state.running) {
    return false;
  }
  // Fire and forget to keep HTTP endpoints fast on low-memory/low-CPU hosts.
  void runCycle();
  return true;
}

export function startAutopilotAgent() {
  if (!config.autopilotEnabled || intervalRef) {
    return;
  }

  state.enabled = true;
  state.nextRunAt = new Date().toISOString();
  runCycle();
  intervalRef = setInterval(runCycle, config.autopilotIntervalMinutes * 60 * 1000);
}
