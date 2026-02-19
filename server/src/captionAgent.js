import axios from "axios";
import { config } from "./config.js";

function fallbackOptimize(caption) {
  const cleaned = caption.trim().replace(/\s+/g, " ");

  const hasHashTag = /#[\w_]+/.test(cleaned);
  const smartTag = hasHashTag ? "" : " #instagram #contentcreator";

  return `${cleaned}${smartTag}`.slice(0, 2200);
}

export async function optimizeCaption(caption) {
  if (!caption || !caption.trim()) {
    return "";
  }

  if (!config.openAiApiKey) {
    return fallbackOptimize(caption);
  }

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: config.openAiModel,
        messages: [
          {
            role: "system",
            content:
              "You improve Instagram captions. Keep the same voice, improve clarity and engagement, keep under 2200 chars, and return only the final caption text."
          },
          { role: "user", content: caption }
        ],
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${config.openAiApiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );

    const text = response?.data?.choices?.[0]?.message?.content?.trim();
    return text || fallbackOptimize(caption);
  } catch {
    return fallbackOptimize(caption);
  }
}
