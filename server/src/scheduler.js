import { getAllPosts, upsertPost } from "./storage.js";
import { publishToInstagram } from "./instagramPublisher.js";

const CHECK_INTERVAL_MS = 15_000;

function isDue(post) {
  return post.status === "SCHEDULED" && new Date(post.scheduledAt).getTime() <= Date.now();
}

export function startScheduler() {
  setInterval(async () => {
    try {
      const posts = await getAllPosts();
      const duePosts = posts.filter(isDue);

      for (const post of duePosts) {
        await upsertPost({ ...post, status: "PUBLISHING", updatedAt: new Date().toISOString() });

        try {
          const result = await publishToInstagram(post);

          await upsertPost({
            ...post,
            status: "PUBLISHED",
            remotePostId: result.remotePostId,
            publishMode: result.mode,
            publishedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            error: ""
          });
        } catch (error) {
          await upsertPost({
            ...post,
            status: "FAILED",
            error: error?.message || "Publish failed",
            updatedAt: new Date().toISOString()
          });
        }
      }
    } catch {
      // Keep scheduler alive if one cycle fails.
    }
  }, CHECK_INTERVAL_MS);
}
