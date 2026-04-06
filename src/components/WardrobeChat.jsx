/**
 * WardrobeChat — conversational wardrobe advisor.
 * Chat persists to IDB across sessions. Supports multiple photos per message.
 */
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useThemeStore } from "../stores/themeStore.js";
import { getCachedState, setCachedState } from "../services/localCache.js";

const QUICK_PROMPTS = [
  "What should I wear today?",
  "Which watches am I neglecting?",
  "Plan 3 outfits for this week",
  "What's my most underused garment?",
  "Suggest a date night look",
];

const MAX_IMAGES = 4;

/** Resize a data URL image to max 800px, returns base64 data URL */
function resizeDataUrl(dataUrl, maxPx = 800) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export default function WardrobeChat({ weather, todayContext }) {
  const { mode } = useThemeStore();
  const isDark = mode === "dark";
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingImages, setPendingImages] = useState([]); // base64[]
  const [restored, setRestored] = useState(false);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);

  const bg = isDark ? "#0a0c10" : "#f8fafc";
  const card = isDark ? "#171a21" : "#fff";
  const border = isDark ? "#2b3140" : "#e5e7eb";
  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = isDark ? "#6b7280" : "#9ca3af";
  const accent = "#3b82f6";
  const userBubble = isDark ? "#1e3a5f" : "#dbeafe";
  const aiBubble = isDark ? "#1a1040" : "#f5f3ff";

  // ── Restore chat from IDB on mount ──────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const cached = await getCachedState();
        if (Array.isArray(cached.chatMessages) && cached.chatMessages.length > 0) {
          setMessages(cached.chatMessages);
        }
      } catch { /* fresh start */ }
      setRestored(true);
    })();
  }, []);

  // ── Persist chat to IDB on every message change ─────────────────────────
  useEffect(() => {
    if (!restored) return;
    // Strip full base64 images to keep IDB lean — store only metadata
    const slim = messages.map(m => ({
      role: m.role,
      content: m.content,
      imageCount: m.images?.length ?? m.imageCount ?? 0,
      ts: m.ts,
    }));
    setCachedState({ chatMessages: slim }).catch(() => {});
  }, [messages, restored]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Handle multi-file select ────────────────────────────────────────────
  const handleFiles = useCallback(async (files) => {
    const remaining = MAX_IMAGES - pendingImages.length;
    const batch = Array.from(files).slice(0, remaining);
    const resized = await Promise.all(batch.map(f => {
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resizeDataUrl(reader.result).then(resolve);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(f);
      });
    }));
    setPendingImages(prev => [...prev, ...resized.filter(Boolean)].slice(0, MAX_IMAGES));
  }, [pendingImages.length]);

  // ── Send message ────────────────────────────────────────────────────────
  const sendMessage = async (msgText) => {
    if (!msgText.trim() && !pendingImages.length) return;
    const userMsg = {
      role: "user",
      content: msgText.trim(),
      images: pendingImages.length ? [...pendingImages] : undefined,
      imageCount: pendingImages.length,
      ts: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    const imagesToSend = [...pendingImages];
    setPendingImages([]);
    setLoading(true);

    try {
      const res = await fetch("/.netlify/functions/wardrobe-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msgText.trim() || "What do you see in these photos?",
          images: imagesToSend,
          conversationHistory: messages.map(m => ({ role: m.role, content: m.content })),
          context: { weather, todayContext },
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessages(prev => [...prev, { role: "assistant", content: data.response, ts: new Date().toISOString() }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${e.message}`, ts: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setPendingImages([]);
    setInput("");
    setCachedState({ chatMessages: [] }).catch(() => {});
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "calc(100vh - 140px)",
      background: bg, borderRadius: 14, border: `1px solid ${border}`, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px", borderBottom: `1px solid ${border}`,
        background: card, display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontSize: 20 }}>💬</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: text }}>Wardrobe AI</div>
          <div style={{ fontSize: 10, color: muted }}>Ask anything about your wardrobe, watches, or style</div>
        </div>
        {messages.length > 0 && (
          <button onClick={startNewChat} style={{
            padding: "5px 10px", borderRadius: 8, fontSize: 10, fontWeight: 700,
            border: `1px solid ${border}`, background: "transparent",
            color: muted, cursor: "pointer",
          }}>
            New Chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "30px 16px" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>👔</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 6 }}>Your personal wardrobe advisor</div>
            <div style={{ fontSize: 11, color: muted, marginBottom: 16 }}>
              I know your entire wardrobe, watch collection, and wear history. Ask me anything.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {QUICK_PROMPTS.map(prompt => (
                <button key={prompt} onClick={() => sendMessage(prompt)} style={{
                  padding: "8px 14px", borderRadius: 10,
                  border: `1px solid ${border}`, background: card,
                  color: text, fontSize: 12, cursor: "pointer", textAlign: "left",
                }}>
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{
            alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
            maxWidth: "85%",
          }}>
            <div style={{
              padding: "10px 14px", borderRadius: 14,
              borderBottomRightRadius: msg.role === "user" ? 4 : 14,
              borderBottomLeftRadius: msg.role === "assistant" ? 4 : 14,
              background: msg.role === "user" ? userBubble : aiBubble,
              border: `1px solid ${msg.role === "user" ? `${accent}33` : "#8b5cf633"}`,
            }}>
              {/* Full images (current session only — not persisted) */}
              {msg.images?.length > 0 && (
                <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
                  {msg.images.map((img, j) => (
                    <img key={j} src={img} alt={`Photo ${j + 1}`} style={{
                      width: msg.images.length === 1 ? "100%" : "48%",
                      maxHeight: 160, objectFit: "cover", borderRadius: 8, display: "block",
                    }} />
                  ))}
                </div>
              )}
              {/* Restored messages: photo count badge */}
              {!msg.images?.length && (msg.imageCount ?? 0) > 0 && (
                <div style={{
                  fontSize: 10, color: muted, marginBottom: 4,
                  padding: "3px 8px", borderRadius: 6,
                  background: isDark ? "#1a1f2b" : "#f3f4f6", display: "inline-block",
                }}>
                  📷 {msg.imageCount} photo{msg.imageCount > 1 ? "s" : ""} attached
                </div>
              )}
              <div style={{
                fontSize: 12, color: text, lineHeight: 1.5,
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {msg.content}
              </div>
            </div>
            <div style={{ fontSize: 9, color: muted, marginTop: 2, textAlign: msg.role === "user" ? "right" : "left" }}>
              {msg.role === "user" ? "You" : "AI"}
              {msg.ts && ` · ${new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ alignSelf: "flex-start", maxWidth: "85%" }}>
            <div style={{
              padding: "10px 14px", borderRadius: 14, borderBottomLeftRadius: 4,
              background: aiBubble, border: "1px solid #8b5cf633",
            }}>
              <div style={{ fontSize: 12, color: muted }}>Thinking...</div>
            </div>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Pending images preview */}
      {pendingImages.length > 0 && (
        <div style={{
          padding: "6px 14px 0", background: card,
          display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
        }}>
          {pendingImages.map((img, i) => (
            <div key={i} style={{ position: "relative" }}>
              <img src={img} alt={`preview ${i}`} style={{
                width: 48, height: 48, borderRadius: 8, objectFit: "cover",
              }} />
              <button onClick={() => setPendingImages(prev => prev.filter((_, j) => j !== i))} style={{
                position: "absolute", top: -4, right: -4,
                width: 18, height: 18, borderRadius: "50%",
                background: "#ef4444", border: "none", color: "#fff",
                fontSize: 10, cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center", lineHeight: 1,
              }}>✕</button>
            </div>
          ))}
          {pendingImages.length < MAX_IMAGES && (
            <button onClick={() => fileRef.current?.click()} style={{
              width: 48, height: 48, borderRadius: 8,
              border: `2px dashed ${border}`, background: "transparent",
              color: muted, fontSize: 18, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>+</button>
          )}
          <span style={{ fontSize: 10, color: muted, marginLeft: 4 }}>
            {pendingImages.length}/{MAX_IMAGES}
          </span>
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: "10px 14px", borderTop: `1px solid ${border}`,
        background: card, display: "flex", gap: 8, alignItems: "center",
      }}>
        <label style={{ cursor: "pointer", fontSize: 20, flexShrink: 0, padding: "4px" }}>
          📷
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
          placeholder="Ask about your wardrobe..."
          disabled={loading}
          style={{
            flex: 1, padding: "10px 14px", borderRadius: 12,
            border: `1px solid ${border}`, background: bg,
            color: text, fontSize: 13, outline: "none",
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || (!input.trim() && !pendingImages.length)}
          style={{
            padding: "10px 16px", borderRadius: 12,
            border: "none", background: accent,
            color: "#fff", fontSize: 13, fontWeight: 700,
            cursor: loading || (!input.trim() && !pendingImages.length) ? "default" : "pointer",
            opacity: loading || (!input.trim() && !pendingImages.length) ? 0.5 : 1,
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
