import { useEffect, useMemo, useState } from "react";

const API_BASE = "";

function statusTone(status) {
  if (status === "PUBLISHED") return "good";
  if (status === "FAILED") return "bad";
  if (status === "PUBLISHING") return "warn";
  return "neutral";
}

function formatDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

export default function App() {
  const [media, setMedia] = useState(null);
  const [caption, setCaption] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [optimizeWithAi, setOptimizeWithAi] = useState(true);
  const [posts, setPosts] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const orderedPosts = useMemo(
    () => [...posts].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)),
    [posts]
  );

  async function fetchPosts() {
    const response = await fetch(`${API_BASE}/api/posts`);
    if (!response.ok) return;
    const data = await response.json();
    setPosts(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    fetchPosts();
    const timer = setInterval(fetchPosts, 10000);
    return () => clearInterval(timer);
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");

    if (!media) {
      setError("Please choose an image or media file.");
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
      formData.append("caption", caption);
      formData.append("scheduledAt", new Date(scheduledAt).toISOString());
      formData.append("optimizeWithAi", String(optimizeWithAi));

      const response = await fetch(`${API_BASE}/api/posts`, {
        method: "POST",
        body: formData
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not schedule post");
      }

      setMedia(null);
      setCaption("");
      setScheduledAt("");
      await fetchPosts();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function publishNow(id) {
    const response = await fetch(`${API_BASE}/api/posts/${id}/publish-now`, { method: "POST" });
    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error || "Could not publish");
    }
    await fetchPosts();
  }

  return (
    <div className="page">
      <header>
        <h1>Instagram Post Automation</h1>
        <p>Upload media, write your caption, optimize with AI, and schedule publishing.</p>
      </header>

      <main className="grid">
        <section className="card">
          <h2>Schedule Post</h2>
          <form onSubmit={onSubmit} className="form">
            <label>
              Media
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setMedia(event.target.files?.[0] || null)}
              />
            </label>

            <label>
              Caption
              <textarea
                rows={5}
                placeholder="Write your caption..."
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
              />
            </label>

            <label>
              Date & Time
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </label>

            <label className="checkbox">
              <input
                type="checkbox"
                checked={optimizeWithAi}
                onChange={(event) => setOptimizeWithAi(event.target.checked)}
              />
              Optimize caption with AI
            </label>

            {error && <p className="error">{error}</p>}

            <button disabled={submitting} type="submit">
              {submitting ? "Scheduling..." : "Schedule Post"}
            </button>
          </form>
        </section>

        <section className="card">
          <h2>Queued & Published Posts</h2>
          <div className="list">
            {orderedPosts.length === 0 && <p>No scheduled posts yet.</p>}

            {orderedPosts.map((post) => (
              <article key={post.id} className="item">
                <img src={`/${post.mediaPath}`} alt={post.mediaOriginalName} />
                <div className="itemContent">
                  <p className="caption">{post.optimizedCaption || post.caption || "(No caption)"}</p>
                  <p>Scheduled: {formatDate(post.scheduledAt)}</p>
                  <p>Published: {formatDate(post.publishedAt)}</p>
                  <p>
                    Status:
                    <span className={`status ${statusTone(post.status)}`}>{post.status}</span>
                  </p>
                  {post.error && <p className="error">Error: {post.error}</p>}
                  {(post.status === "SCHEDULED" || post.status === "FAILED") && (
                    <button onClick={() => publishNow(post.id)}>Publish Now</button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
