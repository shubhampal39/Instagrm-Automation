import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

const dataFile = path.join(process.cwd(), config.dataDir, config.dbFile);

async function ensureDataFile() {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });

  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify({ posts: [] }, null, 2), "utf8");
  }
}

export async function readDb() {
  await ensureDataFile();
  const raw = await fs.readFile(dataFile, "utf8");
  return JSON.parse(raw);
}

export async function writeDb(db) {
  await ensureDataFile();
  await fs.writeFile(dataFile, JSON.stringify(db, null, 2), "utf8");
}

export async function upsertPost(updatedPost) {
  const db = await readDb();
  const existingIdx = db.posts.findIndex((post) => post.id === updatedPost.id);

  if (existingIdx === -1) {
    db.posts.push(updatedPost);
  } else {
    db.posts[existingIdx] = updatedPost;
  }

  await writeDb(db);
  return updatedPost;
}

export async function getAllPosts() {
  const db = await readDb();
  return db.posts.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
}

export async function getPostById(id) {
  const db = await readDb();
  return db.posts.find((post) => post.id === id) || null;
}
