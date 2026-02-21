import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

const dataFile = path.join(process.cwd(), config.dataDir, config.dbFile);

const DEFAULT_CHANNELS = [
  { id: "ig-1", name: "Instagram Channel 1", handle: "@channel_1", accountId: "", accessToken: "" },
  { id: "ig-2", name: "Instagram Channel 2", handle: "@channel_2", accountId: "", accessToken: "" },
  { id: "ig-3", name: "Instagram Channel 3", handle: "@channel_3", accountId: "", accessToken: "" },
  { id: "ig-4", name: "Instagram Channel 4", handle: "@channel_4", accountId: "", accessToken: "" }
];

async function ensureDataFile() {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });

  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify({ posts: [], channels: DEFAULT_CHANNELS }, null, 2), "utf8");
  }
}

function normalizeChannel(input) {
  return {
    id: String(input?.id || "").trim(),
    name: String(input?.name || "").trim(),
    handle: String(input?.handle || "").trim(),
    accountId: String(input?.accountId || "").trim(),
    accessToken: String(input?.accessToken || "").trim()
  };
}

function normalizePost(input) {
  return {
    ...input,
    channelId: String(input?.channelId || "").trim(),
    channelName: String(input?.channelName || "").trim(),
    channelHandle: String(input?.channelHandle || "").trim(),
    channelAccountId: String(input?.channelAccountId || "").trim(),
    channelAccessToken: String(input?.channelAccessToken || "").trim(),
    postType: String(input?.postType || "FEED").toUpperCase(),
    mediaMimeType: String(input?.mediaMimeType || "").trim()
  };
}

function ensureDbShape(db) {
  const next = typeof db === "object" && db ? db : {};
  next.posts = Array.isArray(next.posts) ? next.posts.map(normalizePost) : [];
  next.channels = Array.isArray(next.channels) ? next.channels.map(normalizeChannel) : [];

  if (next.channels.length === 0) {
    next.channels = DEFAULT_CHANNELS;
  }

  return next;
}

export async function readDb() {
  await ensureDataFile();
  const raw = await fs.readFile(dataFile, "utf8");
  const parsed = JSON.parse(raw);
  const normalized = ensureDbShape(parsed);
  if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
    await writeDb(normalized);
  }
  return normalized;
}

export async function writeDb(db) {
  await ensureDataFile();
  const normalized = ensureDbShape(db);
  await fs.writeFile(dataFile, JSON.stringify(normalized, null, 2), "utf8");
}

export async function upsertPost(updatedPost) {
  const db = await readDb();
  const existingIdx = db.posts.findIndex((post) => post.id === updatedPost.id);
  const normalized = normalizePost(updatedPost);

  if (existingIdx === -1) {
    db.posts.push(normalized);
  } else {
    db.posts[existingIdx] = normalized;
  }

  await writeDb(db);
  return normalized;
}

export async function getAllPosts() {
  const db = await readDb();
  return db.posts.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
}

export async function getPostById(id) {
  const db = await readDb();
  return db.posts.find((post) => post.id === id) || null;
}

export async function getAllChannels() {
  const db = await readDb();
  return db.channels;
}

export async function getChannelById(id) {
  const db = await readDb();
  return db.channels.find((channel) => channel.id === id) || null;
}

export async function upsertChannel(updatedChannel) {
  const db = await readDb();
  const normalized = normalizeChannel(updatedChannel);
  const existingIdx = db.channels.findIndex((channel) => channel.id === normalized.id);

  if (existingIdx === -1) {
    db.channels.push(normalized);
  } else {
    db.channels[existingIdx] = normalized;
  }

  await writeDb(db);
  return normalized;
}
