import { useEffect, useMemo, useState } from "react";

const API_BASE = "";
const CAPTION_LIMIT = 2200;

function statusTone(status) {
  if (status === "PUBLISHED") return "good";
  if (status === "FAILED") return "bad";
  if (status === "PUBLISHING") return "warn";
  if (status === "CANCELED") return "muted";
  return "neutral";
}

function toLocalInputValue(date) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

function formatDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

function extractHashtags(text) {
  const matches = text.match(/#[\w_]+/g) || [];
  return [...new Set(matches)].slice(0, 8);
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
  const [media, setMedia] = useState(null);
  const [mediaPreview, setMediaPreview] = useState("");
  const [postType, setPostType] = useState("FEED");
  const [caption, setCaption] = useState("");
  const [scheduledAt, setScheduledAt] = useState(toLocalInputValue(new Date(Date.now() + 30 * 60 * 1000)));
  const [optimizeWithAi, setOptimizeWithAi] = useState(true);

  const [posts, setPosts] = useState([]);
  const [systemStatus, setSystemStatus] = useState(null);
  const [activeTab, setActiveTab] = useState("ALL");
  const [query, setQuery] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [draftOptimizedCaption, setDraftOptimizedCaption] = useState("");
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState("");
  const [editingCaption, setEditingCaption] = useState("");
  const [editingSchedule, setEditingSchedule] = useState("");

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
        String(post.status || "").toLowerCase().includes(normalized);
      return tabOk && searchOk;
    });
  }, [orderedPosts, activeTab, query]);

  const stats = useMemo(() => computeStats(posts), [posts]);
  const successRate = stats.total ? Math.round((stats.published / stats.total) * 100) : 0;
  const hashtags = useMemo(() => extractHashtags(caption), [caption]);

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

  async function fetchPosts() {
    const response = await fetch(`${API_BASE}/api/posts`);
    if (!response.ok) return;
    const data = await response.json();
    setPosts(Array.isArray(data) ? data : []);
  }

  async function fetchSystemStatus() {
    const response = await fetch(`${API_BASE}/api/system/status`);
    if (!response.ok) return;
    const data = await response.json();
    setSystemStatus(data);
  }

  useEffect(() => {
    fetchPosts();
    fetchSystemStatus();
    const timer = setInterval(() => {
      fetchPosts();
      fetchSystemStatus();
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

    if (!media) {
      setError("Please upload an image.");
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
      setDraftOptimizedCaption("");
      setScheduledAt(toLocalInputValue(new Date(Date.now() + 30 * 60 * 1000)));
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

  function startEdit(post) {
    setEditingId(post.id);
    setEditingCaption(post.caption || "");
    setEditingSchedule(toLocalInputValue(new Date(post.scheduledAt)));
  }

  async function saveEdit() {
    const response = await fetch(`${API_BASE}/api/posts/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caption: editingCaption,
        scheduledAt: new Date(editingSchedule).toISOString()
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "Could not update post");
      return;
    }

    setEditingId("");
    await fetchPosts();
  }

  const healthTone =
    systemStatus?.publishMode === "live" && systemStatus?.hasInstagramCredentials ? "good" : "warn";

  return (
    <div className="shell">
      <div className="bgOrbs" />
      <header className="hero">
        <div>
          <p className="eyebrow">AI Automation Studio</p>
          <h1>Instagram Post Command Center</h1>
          <p className="subtitle">
            Upload, optimize, schedule, and auto-publish with full state visibility.
          </p>
        </div>
        <div className={`healthCard ${healthTone}`}>
          <p className="healthTitle">System Health</p>
          <p>Mode: {systemStatus?.publishMode || "-"}</p>
          <p>IG Credentials: {systemStatus?.hasInstagramCredentials ? "Connected" : "Missing"}</p>
          <p>AI Caption: {systemStatus?.hasOpenAiKey ? "Live" : "Fallback"}</p>
          <p>Timezone: {systemStatus?.timezone || "-"}</p>
        </div>
      </header>

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
                <img src={mediaPreview} alt="Preview" className="preview" />
              ) : (
                <p>Drag & drop image here or choose file</p>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setMedia(event.target.files?.[0] || null)}
              />
            </div>

            <label>
              Post Type
              <select value={postType} onChange={(event) => setPostType(event.target.value)}>
                <option value="FEED">Feed Post</option>
                <option value="STORY">Story</option>
              </select>
            </label>

            <label>
              Caption
              <textarea
                rows={5}
                value={caption}
                placeholder={postType === "STORY" ? "Story text (optional)..." : "Tell your story..."}
                onChange={(event) => setCaption(event.target.value.slice(0, CAPTION_LIMIT))}
              />
            </label>

            <div className="captionMeta">
              <span>{caption.length}/{CAPTION_LIMIT}</span>
              <div className="tagRow">
                {hashtags.map((tag) => (
                  <span key={tag} className="chip">{tag}</span>
                ))}
              </div>
            </div>

            <div className="row">
              <label>
                Date & Time
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                />
              </label>
            </div>

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
                {postType === "STORY" ? "Caption optimization is disabled for story posts" : "Optimize caption on schedule"}
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
                {submitting ? "Scheduling..." : "Schedule Post"}
              </button>
            </div>

            {draftOptimizedCaption && (
              <div className="diffCard">
                <p className="smallTitle">AI Optimization Preview</p>
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
              placeholder="Search caption/status"
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
            {filteredPosts.length === 0 && <p className="mutedText">No posts match this view.</p>}

            {filteredPosts.map((post) => (
              <article key={post.id} className="postCard">
                <img src={`/${post.mediaPath}`} alt={post.mediaOriginalName} />
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

                  <div className="timeline">
                    <span className={post.status !== "SCHEDULED" ? "done" : ""}>Queued</span>
                    <span className={post.status === "PUBLISHING" || post.status === "PUBLISHED" ? "done" : ""}>Publishing</span>
                    <span className={post.status === "PUBLISHED" ? "done" : post.status === "FAILED" ? "bad" : ""}>
                      {post.status === "FAILED" ? "Failed" : "Published"}
                    </span>
                  </div>

                  {post.error && <p className="errorText">{post.error}</p>}

                  {editingId === post.id ? (
                    <div className="editBox">
                      <textarea
                        rows={3}
                        value={editingCaption}
                        onChange={(event) => setEditingCaption(event.target.value)}
                      />
                      <input
                        type="datetime-local"
                        value={editingSchedule}
                        onChange={(event) => setEditingSchedule(event.target.value)}
                      />
                      <div className="rowButtons">
                        <button type="button" onClick={saveEdit}>Save</button>
                        <button type="button" onClick={() => setEditingId("")}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="rowButtons">
                      {(post.status === "SCHEDULED" || post.status === "FAILED") && (
                        <button type="button" onClick={() => publishNow(post.id)}>Publish Now</button>
                      )}
                      {(post.status === "SCHEDULED" || post.status === "FAILED") && (
                        <button type="button" onClick={() => cancelPost(post.id)}>Cancel</button>
                      )}
                      {(post.status === "SCHEDULED" || post.status === "FAILED") && (
                        <button type="button" onClick={() => startEdit(post)}>Edit</button>
                      )}
                      <button type="button" onClick={() => duplicatePost(post.id)}>Duplicate</button>
                    </div>
                  )}
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
