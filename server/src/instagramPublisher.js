import axios from "axios";
import { config, hasInstagramCredentials } from "./config.js";

function localMediaToPublicUrl(mediaPath) {
  if (!mediaPath) return "";
  const relative = mediaPath.replace(/^uploads\//, "");
  return `${config.serverBaseUrl}/uploads/${relative}`;
}

function isLocalhostUrl(url) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(url);
}

async function discoverInstagramAccountFromPages() {
  const response = await axios.get("https://graph.facebook.com/v20.0/me/accounts", {
    params: {
      fields: "id,name,instagram_business_account{id,username}",
      access_token: config.instagramAccessToken
    },
    timeout: 20000
  });

  const pages = response?.data?.data || [];
  for (const page of pages) {
    const ig = page?.instagram_business_account;
    if (ig?.id) {
      return ig.id;
    }
  }

  return null;
}

async function getTargetInstagramAccountId() {
  if (config.instagramAccountId) {
    return config.instagramAccountId;
  }

  const discovered = await discoverInstagramAccountFromPages();
  if (discovered) {
    return discovered;
  }

  throw new Error(
    "No accessible Instagram Business account found. /me works, but /me/accounts has no linked page+instagram_business_account for this token."
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForContainerReady(creationId) {
  const maxAttempts = 12;
  const delayMs = 2500;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let statusResponse;
    try {
      statusResponse = await axios.get(
        `https://graph.facebook.com/v20.0/${creationId}`,
        {
          params: {
            fields: "status_code",
            access_token: config.instagramAccessToken
          },
          timeout: 20000
        }
      );
    } catch (error) {
      withMetaErrorDetails(error, "Meta container status check failed");
    }

    const statusCode = statusResponse?.data?.status_code;
    if (statusCode === "FINISHED") {
      return;
    }

    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      throw new Error(`Instagram media container status is ${statusCode}`);
    }

    await sleep(delayMs);
  }

  throw new Error("Instagram media container was not ready in time.");
}

function withMetaErrorDetails(error, fallback) {
  const metaError = error?.response?.data?.error;
  if (!metaError) {
    throw error;
  }

  const details = [
    metaError.message,
    metaError.code ? `code=${metaError.code}` : "",
    metaError.error_subcode ? `subcode=${metaError.error_subcode}` : ""
  ]
    .filter(Boolean)
    .join(" | ");

  throw new Error(`${fallback}: ${details}`);
}

function normalizeCommentPool(pool) {
  if (!Array.isArray(pool)) return [];
  return pool
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

function pickRandomComment(pool) {
  if (!pool.length) return "";
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

async function autoCommentOnMedia(mediaId, message) {
  if (!mediaId || !message) return { attempted: false, posted: false, commentId: "" };

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v20.0/${mediaId}/comments`,
      null,
      {
        params: {
          message,
          access_token: config.instagramAccessToken
        },
        timeout: 20000
      }
    );

    return {
      attempted: true,
      posted: true,
      commentId: response?.data?.id || "",
      message
    };
  } catch (error) {
    const metaError = error?.response?.data?.error;
    return {
      attempted: true,
      posted: false,
      commentId: "",
      message,
      error: metaError?.message || error?.message || "Auto-comment failed"
    };
  }
}

export async function publishToInstagram(post) {
  const publishMode = String(config.publishMode || "").toLowerCase();
  if (publishMode === "mock") {
    return {
      success: true,
      mode: "mock",
      remotePostId: `mock_${post.id}`,
      message: "Post published in mock mode"
    };
  }

  if (!hasInstagramCredentials()) {
    throw new Error(
      "Live mode requires INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_ACCOUNT_ID environment variables."
    );
  }

  const imageUrl = localMediaToPublicUrl(post.mediaPath);

  if (!imageUrl || isLocalhostUrl(imageUrl)) {
    throw new Error(
      "Live Instagram publish requires a public SERVER_BASE_URL. Localhost URLs are not reachable by Meta Graph API."
    );
  }

  const targetInstagramAccountId = await getTargetInstagramAccountId();
  const postType = String(post.postType || "FEED").toUpperCase();
  const isStory = postType === "STORY";
  const mediaParams = {
    image_url: imageUrl,
    access_token: config.instagramAccessToken
  };

  if (isStory) {
    mediaParams.media_type = "STORIES";
  } else {
    mediaParams.caption = post.optimizedCaption || post.caption;
  }

  let container;
  try {
    container = await axios.post(
      `https://graph.facebook.com/v20.0/${targetInstagramAccountId}/media`,
      null,
      {
        params: mediaParams,
        timeout: 20000
      }
    );
  } catch (error) {
    withMetaErrorDetails(error, "Meta /media failed");
  }

  const creationId = container?.data?.id;

  if (!creationId) {
    throw new Error("Could not create Instagram media container");
  }

  await waitForContainerReady(creationId);

  let published;
  try {
    published = await axios.post(
      `https://graph.facebook.com/v20.0/${targetInstagramAccountId}/media_publish`,
      null,
      {
        params: {
          creation_id: creationId,
          access_token: config.instagramAccessToken
        },
        timeout: 20000
      }
    );
  } catch (error) {
    withMetaErrorDetails(error, "Meta /media_publish failed");
  }

  const publishedMediaId = published?.data?.id || "";
  const commentPool = normalizeCommentPool(post.commentPool);
  const commentMessage = pickRandomComment(commentPool);

  const autoComment =
    post.autoCommentEnabled && postType !== "STORY"
      ? await autoCommentOnMedia(publishedMediaId, commentMessage)
      : { attempted: false, posted: false, commentId: "", message: "" };

  return {
    success: true,
    mode: "live",
    remotePostId: publishedMediaId,
    autoComment,
    message: "Post published to Instagram"
  };
}
