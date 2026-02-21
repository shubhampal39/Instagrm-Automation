import { useEffect, useMemo, useState } from "react";

const API_BASE = "";
const CAPTION_LIMIT = 2200;

function toLocalInputValue(date) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

function formatDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

function statusTone(status) {
  if (status === "PUBLISHED") return "good";
  if (status === "FAILED") return "bad";
  if (status === "PUBLISHING") return "warn";
  if (status === "CANCELED") return "muted";
  return "neutral";
}

function computeStats(posts) {
  return {
    total: posts.length,
    scheduled: posts.filter((p) => p.status === "SCHEDULED").length,
    published: posts.filter((p) => p.status === "PUBLISHED").length,
    failed: posts.filter((p) => p.status === "FAILED").length
  };
}

export default function App() {
  const [channels, setChannels] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [savingChannel, setSavingChannel] = useState(false);

  const [media, setMedia] = useState(null);
  const [mediaPreview, setMediaPreview] = useState("");
  const [postType, setPostType] = useState("FEED");
  const [caption, setCaption] = useState("");
  const [scheduledAt, setScheduledAt] = useState(toLocalInputValue(new Date(Date.now() + 30 * 60 * 1000)));
  const [optimizeWithAi, setOptimizeWithAi] = useState(true);

  const [posts, setPosts] = useState([]);
  const [activeTab, setActiveTab] = useState("ALL");
  const [query, setQuery] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [draftOptimizedCaption, setDraftOptimizedCaption] = useState("");
  const [error, setError] = useState("");

  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId) || null,
    [channels, selectedChannelId]
  );

  const stats = useMemo(() => computeStats(posts), [posts]);
  const successRate = stats.total ? Math.round((stats.published / stats.total) * 100) : 0;

  const orderedPosts = useMemo(
    () => [...posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [posts]
  );

  const filteredPosts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return orderedPosts.filter((post) => {
      const tabOk = activeTab === "ALL" ? true : post.status === activeTab;
      const searchOk =
        !normalized ||
        String(post.caption || "").toLowerCase().includes(normalized) ||
        String(post.optimizedCaption || "").toLowerCase().includes(normalized) ||
        String(post.channelName || "").toLowerCase().includes(normalized) ||
        String(post.channelHandle || "").toLowerCase().includes(normalized) ||
        String(post.status || "").toLowerCase().includes(normalized);
      return tabOk && searchOk;
    });
  }, [orderedPosts, activeTab, query]);

  const activity = useMemo(
    () =>
      [...posts]
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 8)
        .map((post) => ({
          id: post.id,
          status: post.status,
          time: post.updatedAt,
          caption: post.caption || "(No caption)"
        })),
    [posts]
  );

  async function fetchChannels() {
    const response = await fetch(`${API_BASE}/api/channels`);
    if (!response.ok) return;
    const data = await response.json();
    const normalized = Array.isArray(data) ? data : [];
    setChannels(normalized);
    if (!selectedChannelId && normalized.length) {
      setSelectedChannelId(normalized[0].id);
    }
  }

  async function fetchPosts() {
    const response = await fetch(`${API_BASE}/api/posts`);
    if (!response.ok) return;
    const data = await response.json();
    setPosts(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    fetchChannels();
    fetchPosts();
    const timer = setInterval(() => {
      fetchPosts();
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!media) {
      setMediaPreview("");
      return;
    }

    const nextPreview = URL.createObjectURL(media);
    setMediaPreview(nextPreview);
    return () => URL.revokeObjectURL(nextPreview);
  }, [media]);

  function applyQuickTime(minutesAhead) {
    setScheduledAt(toLocalInputValue(new Date(Date.now() + minutesAhead * 60 * 1000)));
  }

  function onDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      setMedia(file);
    }
  }

  function updateSelectedChannel(patch) {
    setChannels((prev) =>
      prev.map((channel) =>
        channel.id === selectedChannelId ? { ...channel, ...patch } : channel
      )
    );
  }

  async function saveChannel() {
    if (!selectedChannel) return;
    setSavingChannel(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/api/channels/${selectedChannel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedChannel.name,
          handle: selectedChannel.handle,
          accountId: selectedChannel.accountId,
          accessToken: selectedChannel.accessToken
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not save channel settings");
      }
      await fetchChannels();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingChannel(false);
    }
  }

  async function onOptimizeDraft() {
    if (postType === "STORY") return;
    if (!caption.trim()) return;

    setOptimizing(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/api/caption/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not optimize caption");
      setDraftOptimizedCaption(payload.optimizedCaption || "");
    } catch (optimizeError) {
      setError(optimizeError.message);
    } finally {
      setOptimizing(false);
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError("");

    if (!selectedChannel) {
      setError("Select a channel first.");
      return;
    }

    if (!media) {
      setError("Please upload media.");
      return;
    }

    if (!scheduledAt) {
      setError("Please choose a publish date and time.");
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("media", media);
      formData.append("postType", postType);
      formData.append("channelId", selectedChannel.id);
      formData.append("caption", caption);
      formData.append("scheduledAt", new Date(scheduledAt).toISOString());
      formData.append("optimizeWithAi", String(optimizeWithAi && postType !== "STORY"));

      const response = await fetch(`${API_BASE}/api/posts`, {
        method: "POST",
        body: formData
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not schedule post");
      }

      setMedia(null);
      setPostType("FEED");
      setCaption("");
      setScheduledAt(toLocalInputValue(new Date(Date.now() + 30 * 60 * 1000)));
      setDraftOptimizedCaption("");
      await fetchPosts();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function publishNow(id) {
    const response = await fetch(`${API_BASE}/api/posts/${id}/publish-now`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "Could not publish");
    }
    await fetchPosts();
  }

  async function cancelPost(id) {
    const response = await fetch(`${API_BASE}/api/posts/${id}/cancel`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "Could not cancel");
    }
    await fetchPosts();
  }

  async function duplicatePost(id) {
    const duplicateAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const response = await fetch(`${API_BASE}/api/posts/${id}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledAt: duplicateAt })
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "Could not duplicate post");
    }
    await fetchPosts();
  }

  return (
    <div className="shell">
      <div className="bgOrbs" />
      <header className="hero">
        <div>
          <p className="eyebrow">AI Automation Studio</p>
          <h1>Instagram 4-Channel Automation</h1>
          <p className="subtitle">
            Schedule and auto publish feed posts, reels, and stories per Instagram account.
          </p>
        </div>
      </header>

      <section className="panel channelPanel">
        <div className="queueHeader">
          <h2>Channels</h2>
          <p className="meta">Each channel uses its own Instagram Account ID and Access Token.</p>
        </div>
        <div className="channelGrid">
          {channels.map((channel) => (
            <button
              key={channel.id}
              type="button"
              className={`channelCard ${selectedChannelId === channel.id ? "active" : ""}`}
              onClick={() => setSelectedChannelId(channel.id)}
            >
              <span className="channelName">{channel.name || channel.id}</span>
              <span className="channelHandle">{channel.handle || "@"}</span>
            </button>
          ))}
        </div>

        {selectedChannel && (
          <div className="channelEditor">
            <input
              type="text"
              placeholder="Channel name"
              value={selectedChannel.name || ""}
              onChange={(event) => updateSelectedChannel({ name: event.target.value })}
            />
            <input
              type="text"
              placeholder="@handle"
              value={selectedChannel.handle || ""}
              onChange={(event) => updateSelectedChannel({ handle: event.target.value })}
            />
            <input
              type="text"
              placeholder="Instagram Business Account ID"
              value={selectedChannel.accountId || ""}
              onChange={(event) => updateSelectedChannel({ accountId: event.target.value })}
            />
            <input
              type="text"
              placeholder="Page/Instagram Access Token"
              value={selectedChannel.accessToken || ""}
              onChange={(event) => updateSelectedChannel({ accessToken: event.target.value })}
            />
            <div className="rowButtons">
              <button type="button" onClick={saveChannel} disabled={savingChannel}>
                {savingChannel ? "Saving..." : "Save Channel"}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="metrics">
        <article className="metric">
          <h3>Total</h3>
          <p>{stats.total}</p>
        </article>
        <article className="metric">
          <h3>Scheduled</h3>
          <p>{stats.scheduled}</p>
        </article>
        <article className="metric">
          <h3>Published</h3>
          <p>{stats.published}</p>
        </article>
        <article className="metric">
          <h3>Failed</h3>
          <p>{stats.failed}</p>
        </article>
        <article className="metric">
          <h3>Success Rate</h3>
          <p>{successRate}%</p>
        </article>
      </section>

      <main className="layout">
        <section className="panel composePanel">
          <h2>Compose & Schedule</h2>
          <form onSubmit={onSubmit} className="composeForm">
            <div
              className="dropZone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDrop}
            >
              {mediaPreview ? (
                media?.type?.startsWith("video/") ? (
                  <video src={mediaPreview} className="preview" controls muted />
                ) : (
                  <img src={mediaPreview} alt="Preview" className="preview" />
                )
              ) : (
                <p>
                  Feed/Story: image only (jpg/png). Reel: video only (mp4/mov). Drag and drop or choose file.
                </p>
              )}
              <input
                type="file"
                accept="image/*,video/*"
                onChange={(event) => setMedia(event.target.files?.[0] || null)}
              />
            </div>

            <label>
              Post Type
              <select value={postType} onChange={(event) => setPostType(event.target.value)}>
                <option value="FEED">Feed Post</option>
                <option value="REEL">Reel</option>
                <option value="STORY">Story</option>
              </select>
            </label>

            <label>
              Caption
              <textarea
                rows={5}
                value={caption}
                placeholder={postType === "STORY" ? "Story text (optional)..." : "Write your caption..."}
                onChange={(event) => setCaption(event.target.value.slice(0, CAPTION_LIMIT))}
              />
            </label>

            <div className="captionMeta">
              <span>{caption.length}/{CAPTION_LIMIT}</span>
              <span>Channel: {selectedChannel?.name || "-"}</span>
            </div>

            <label>
              Date & Time
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </label>

            <div className="quickButtons">
              <button type="button" onClick={() => applyQuickTime(60)}>In 1 hour</button>
              <button type="button" onClick={() => applyQuickTime(24 * 60)}>Tomorrow</button>
              <button type="button" onClick={() => applyQuickTime(7 * 24 * 60)}>Next week</button>
            </div>

            <label className="toggle">
              <input
                type="checkbox"
                checked={optimizeWithAi}
                onChange={(event) => setOptimizeWithAi(event.target.checked)}
                disabled={postType === "STORY"}
              />
              <span>
                {postType === "STORY" ? "Caption optimization is disabled for story" : "Optimize caption before schedule"}
              </span>
            </label>

            <div className="actionRow">
              <button
                type="button"
                onClick={onOptimizeDraft}
                disabled={optimizing || !caption.trim() || postType === "STORY"}
              >
                {optimizing ? "Optimizing..." : "Preview AI Optimize"}
              </button>
              <button type="submit" disabled={submitting}>
                {submitting ? "Scheduling..." : "Schedule"}
              </button>
            </div>

            {draftOptimizedCaption && (
              <div className="diffCard">
                <p className="smallTitle">AI Caption Preview</p>
                <p><strong>Original:</strong> {caption}</p>
                <p><strong>Optimized:</strong> {draftOptimizedCaption}</p>
                <button type="button" onClick={() => setCaption(draftOptimizedCaption)}>
                  Use Optimized Caption
                </button>
              </div>
            )}

            {error && <p className="errorText">{error}</p>}
          </form>
        </section>

        <section className="panel queuePanel">
          <div className="queueHeader">
            <h2>Pipeline</h2>
            <input
              type="text"
              placeholder="Search caption/status/channel"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="tabs">
            {["ALL", "SCHEDULED", "PUBLISHING", "PUBLISHED", "FAILED", "CANCELED"].map((tab) => (
              <button
                key={tab}
                type="button"
                className={activeTab === tab ? "active" : ""}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="postList">
            {filteredPosts.length === 0 && <p className="mutedText">No posts in this view.</p>}
            {filteredPosts.map((post) => (
              <article key={post.id} className="postCard">
                {String(post.postType || "").toUpperCase() === "REEL" ? (
                  <video src={post.mediaUrl || `/${post.mediaPath}`} controls muted />
                ) : (
                  <img src={post.mediaUrl || `/${post.mediaPath}`} alt={post.mediaOriginalName} />
                )}
                <div className="postContent">
                  <div className="postTop">
                    <p className="captionLine">{post.optimizedCaption || post.caption || "(No caption)"}</p>
                    <div className="postBadges">
                      <span className="badge type">{post.postType || "FEED"}</span>
                      <span className={`badge ${statusTone(post.status)}`}>{post.status}</span>
                    </div>
                  </div>

                  <p className="meta">Scheduled: {formatDate(post.scheduledAt)}</p>
                  <p className="meta">Published: {formatDate(post.publishedAt)}</p>
                  <p className="meta">
                    Channel: {post.channelName || "Unknown"} {post.channelHandle ? `(${post.channelHandle})` : ""}
                  </p>

                  <div className="timeline">
                    <span className={post.status !== "SCHEDULED" ? "done" : ""}>Queued</span>
                    <span className={post.status === "PUBLISHING" || post.status === "PUBLISHED" ? "done" : ""}>Publishing</span>
                    <span className={post.status === "PUBLISHED" ? "done" : post.status === "FAILED" ? "bad" : ""}>
                      {post.status === "FAILED" ? "Failed" : "Published"}
                    </span>
                  </div>

                  {post.error && <p className="errorText">{post.error}</p>}

                  <div className="rowButtons">
                    {(post.status === "SCHEDULED" || post.status === "FAILED") && (
                      <button type="button" onClick={() => publishNow(post.id)}>Publish Now</button>
                    )}
                    {(post.status === "SCHEDULED" || post.status === "FAILED") && (
                      <button type="button" onClick={() => cancelPost(post.id)}>Cancel</button>
                    )}
                    <button type="button" onClick={() => duplicatePost(post.id)}>Duplicate</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel activityPanel">
          <h2>Recent Activity</h2>
          <div className="activityList">
            {activity.length === 0 && <p className="mutedText">No activity yet.</p>}
            {activity.map((item) => (
              <article key={item.id} className="activityItem">
                <p className="meta">{formatDate(item.time)}</p>
                <p className="captionLine">{item.caption}</p>
                <span className={`badge ${statusTone(item.status)}`}>{item.status}</span>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
