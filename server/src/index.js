import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { v4 as uuidv4 } from "uuid";
import { config } from "./config.js";
import { getAllPosts, getPostById, upsertPost } from "./storage.js";
import { optimizeCaption } from "./captionAgent.js";
import { publishToInstagram } from "./instagramPublisher.js";
import { startScheduler } from "./scheduler.js";

const app = express();

await fs.mkdir(path.join(process.cwd(), config.uploadDir), { recursive: true });

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(process.cwd(), config.uploadDir)));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(process.cwd(), config.uploadDir)),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      return cb(null, true);
    }
    return cb(new Error("Only image uploads are supported in this version."));
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "instagram-automation-server" });
});

app.get("/api/posts", async (_req, res) => {
  const posts = await getAllPosts();
  res.json(posts);
});

app.post("/api/posts", upload.single("media"), async (req, res) => {
  try {
    const { caption = "", scheduledAt, optimizeWithAi = "false" } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "media file is required" });
    }

    if (!scheduledAt || Number.isNaN(Date.parse(scheduledAt))) {
      return res.status(400).json({ error: "valid scheduledAt is required" });
    }

    const optimizedCaption =
      optimizeWithAi === "true" ? await optimizeCaption(caption) : "";

    const post = {
      id: uuidv4(),
      caption,
      optimizedCaption,
      mediaPath: `${config.uploadDir}/${req.file.filename}`,
      mediaOriginalName: req.file.originalname,
      scheduledAt: new Date(scheduledAt).toISOString(),
      status: "SCHEDULED",
      publishMode: "",
      remotePostId: "",
      error: "",
      publishedAt: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await upsertPost(post);
    return res.status(201).json(post);
  } catch (error) {
    return res.status(500).json({ error: error?.message || "could not schedule post" });
  }
});

app.post("/api/posts/:id/optimize-caption", async (req, res) => {
  const post = await getPostById(req.params.id);

  if (!post) {
    return res.status(404).json({ error: "post not found" });
  }

  const optimizedCaption = await optimizeCaption(post.caption);
  const updated = { ...post, optimizedCaption, updatedAt: new Date().toISOString() };
  await upsertPost(updated);

  return res.json(updated);
});

app.patch("/api/posts/:id", async (req, res) => {
  const post = await getPostById(req.params.id);

  if (!post) {
    return res.status(404).json({ error: "post not found" });
  }

  const next = {
    ...post,
    caption: req.body.caption ?? post.caption,
    optimizedCaption: req.body.optimizedCaption ?? post.optimizedCaption,
    scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt).toISOString() : post.scheduledAt,
    updatedAt: new Date().toISOString()
  };

  await upsertPost(next);
  return res.json(next);
});

app.post("/api/posts/:id/publish-now", async (req, res) => {
  const post = await getPostById(req.params.id);

  if (!post) {
    return res.status(404).json({ error: "post not found" });
  }

  try {
    await upsertPost({ ...post, status: "PUBLISHING", updatedAt: new Date().toISOString() });
    const result = await publishToInstagram(post);

    const publishedPost = {
      ...post,
      status: "PUBLISHED",
      remotePostId: result.remotePostId,
      publishMode: result.mode,
      error: "",
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await upsertPost(publishedPost);
    return res.json(publishedPost);
  } catch (error) {
    const failedPost = {
      ...post,
      status: "FAILED",
      error: error?.message || "publish failed",
      updatedAt: new Date().toISOString()
    };

    await upsertPost(failedPost);
    return res.status(500).json(failedPost);
  }
});

const clientDistCandidates = [
  path.join(process.cwd(), "client", "dist"),
  path.resolve(process.cwd(), "..", "client", "dist")
];

let clientDistPath = "";
try {
  for (const candidate of clientDistCandidates) {
    try {
      await fs.access(candidate);
      clientDistPath = candidate;
      break;
    } catch {
      // Try next candidate.
    }
  }

  if (!clientDistPath) {
    throw new Error("client dist not found");
  }

  app.use(express.static(clientDistPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) {
      return next();
    }
    return res.sendFile(path.join(clientDistPath, "index.html"));
  });
} catch {
  // Client build not present in local dev API-only mode.
}

app.use((error, _req, res, _next) => {
  if (error?.message) {
    return res.status(400).json({ error: error.message });
  }
  return res.status(500).json({ error: "Unexpected server error" });
});

startScheduler();

app.listen(config.port, () => {
  console.log(`API running on http://localhost:${config.port}`);
});
