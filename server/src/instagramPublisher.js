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

async function fetchConfiguredInstagramAccount() {
  if (!config.instagramAccountId) {
    return null;
  }

  try {
    const response = await axios.get(
      `https://graph.facebook.com/v20.0/${config.instagramAccountId}`,
      {
        params: {
          fields: "id,username,account_type",
          access_token: config.instagramAccessToken
        },
        timeout: 20000
      }
    );

    return response?.data?.id ? response.data.id : null;
  } catch {
    return null;
  }
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
  const configured = await fetchConfiguredInstagramAccount();
  if (configured) {
    return configured;
  }

  const discovered = await discoverInstagramAccountFromPages();
  if (discovered) {
    return discovered;
  }

  throw new Error(
    "No accessible Instagram Business account found. /me works, but /me/accounts has no linked page+instagram_business_account for this token."
  );
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

  const container = await axios.post(
    `https://graph.facebook.com/v20.0/${targetInstagramAccountId}/media`,
    null,
    {
      params: {
        image_url: imageUrl,
        caption: post.optimizedCaption || post.caption,
        access_token: config.instagramAccessToken
      },
      timeout: 20000
    }
  );

  const creationId = container?.data?.id;

  if (!creationId) {
    throw new Error("Could not create Instagram media container");
  }

  const published = await axios.post(
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

  return {
    success: true,
    mode: "live",
    remotePostId: published?.data?.id || "",
    message: "Post published to Instagram"
  };
}
