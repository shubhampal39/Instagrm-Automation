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
    "Discipline is stronger than mood.",
    "Small progress daily becomes a life upgrade.",
    "Be consistent. Results will follow.",
    "Turn pressure into power.",
    "Show up even when motivation is low."
  ];
  const pick = hooks[Math.floor(Math.random() * hooks.length)];
  return `${pick}\n\n#Motivation #Mindset #Growth #Discipline #DailyInspiration #Success #Focus #KeepGoing`;
}

async function generateCaption() {
  const basePrompt =
    "Write a short, high-engagement Instagram caption for a motivational quote feed post. Keep it under 140 characters plus 8 relevant hashtags for India audience and growth reach.";
  const optimized = await optimizeCaption(basePrompt);
  return (optimized || fallbackCaption()).slice(0, 2200);
}

const QUOTE_POOL = [
  "Your future is built by what you do today.",
  "Consistency beats intensity.",
  "Push through. Progress is on the other side.",
  "Do hard things until they become your normal.",
  "You do not need permission to level up."
];

function pickQuote() {
  return QUOTE_POOL[Math.floor(Math.random() * QUOTE_POOL.length)];
}

function generateQuoteImageUrl(quote) {
  const encoded = encodeURIComponent(quote.toUpperCase());
  return `https://placehold.co/1080x1080/0f172a/f8fafc/png?text=${encoded}&font=montserrat`;
}

async function createAutopilotPost() {
  const quote = pickQuote();
  const mediaUrl = generateQuoteImageUrl(quote);
  const caption = await generateCaption();
  const now = Date.now();
  const scheduleAt = new Date(now + config.autopilotDelayMinutes * 60 * 1000).toISOString();

  const post = {
    id: uuidv4(),
    postType: "FEED",
    source: "AUTOPILOT_AGENT",
    mediaUrl,
    autoCommentEnabled: true,
    commentPool: [
      "Which line motivated you the most?",
      "Save this for your next low-energy day.",
      "Comment if you are building in silence."
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
    mediaPath: "",
    mediaOriginalName: "autopilot-quote.png",
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
