import { getAllPosts, upsertPost } from "./storage.js";
import {
  postCommentToInstagramWithToken,
  publishToInstagram
} from "./instagramPublisher.js";

const CHECK_INTERVAL_MS = 15_000;

function isDue(post) {
  return post.status === "SCHEDULED" && new Date(post.scheduledAt).getTime() <= Date.now();
}

function isScheduledCommentDue(post) {
  if (post.status !== "PUBLISHED") return false;
  if (!post.scheduledCommentEnabled) return false;
  if (post.scheduledCommentStatus === "POSTED") return false;
  if (!post.remotePostId) return false;
  const dueAt = post.scheduledCommentAt ? new Date(post.scheduledCommentAt).getTime() : NaN;
  return !Number.isNaN(dueAt) && dueAt <= Date.now();
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
            autoCommentPosted: Boolean(result?.autoComment?.posted),
            autoCommentMessage: result?.autoComment?.message || "",
            autoCommentId: result?.autoComment?.commentId || "",
            autoCommentError: result?.autoComment?.error || "",
            scheduledCommentStatus: post.scheduledCommentEnabled ? "PENDING" : "NONE",
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

      const updatedPosts = await getAllPosts();
      const dueComments = updatedPosts.filter(isScheduledCommentDue);

      for (const post of dueComments) {
        const commentResult = await postCommentToInstagramWithToken(
          post.remotePostId,
          post.scheduledCommentText || "",
          post.channelAccessToken || ""
        );

        await upsertPost({
          ...post,
          scheduledCommentStatus: commentResult.posted ? "POSTED" : "FAILED",
          scheduledCommentId: commentResult.commentId || "",
          scheduledCommentError: commentResult.error || "",
          scheduledCommentPostedAt: commentResult.posted ? new Date().toISOString() : "",
          updatedAt: new Date().toISOString()
        });
      }
    } catch {
      // Keep scheduler alive if one cycle fails.
    }
  }, CHECK_INTERVAL_MS);
}
