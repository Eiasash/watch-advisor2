/**
 * WardrobeChat — conversational wardrobe advisor.
 * Embedded chat UI that answers questions about your wardrobe,
 * outfit planning, watch rotation, and style.
 */
import React, { useState, useRef, useEffect } from "react";
import { useThemeStore } from "../stores/themeStore.js";

const QUICK_PROMPTS = [
  "What should I wear today?",
  "Which watches am I neglecting?",
  "Plan 3 outfits for this week",
  "What's my most underused garment?",
  "Suggest a date night look",
];

export default function WardrobeChat({ weather, todayContext }) {
  const { mode } = useThemeStore();
  const isDark = mode === "dark";
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingImage, setPendingImage] = useState(null); // base64
  const scrollRef = useRef(null);

  const bg = isDark ? "#0a0c10" : "#f8fafc";
  const card = isDark ? "#171a21" : "#fff";
  const border = isDark ? "#2b3140" : "#e5e7eb";
  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = isDark ? "#6b7280" : "#9ca3af";
  const accent = "#3b82f6";
  const userBubble = isDark ? "#1e3a5f" : "#dbeafe";
  const aiBubble = isDark ? "#1a1040" : "#f5f3ff";

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text) => {
    if (!text.trim() && !pendingImage) return;
    const userMsg = { role: "user", content: text.trim(), image: pendingImage ?? null };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    const imageToSend = pendingImage;
    setPendingImage(null);
    setLoading(true);

    try {
      const res = await fetch("/.netlify/functions/wardrobe-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim() || "What do you see in this photo?",
          image: imageToSend,
          conversationHistory: messages.map(m => ({ role: m.role, content: m.content })),
          context: { weather, todayContext },
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
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
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: text }}>Wardrobe AI</div>
          <div style={{ fontSize: 10, color: muted }}>Ask anything about your wardrobe, watches, or style</div>
        </div>
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
                  transition: "border-color 0.15s",
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
              {msg.image && (
                <img src={msg.image} alt="Uploaded" style={{
                  width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 8, marginBottom: 6, display: "block",
                }} />
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

      {/* Pending image preview */}
      {pendingImage && (
        <div style={{ padding: "6px 14px 0", background: card, display: "flex", alignItems: "center", gap: 8 }}>
          <img src={pendingImage} alt="preview" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }} />
          <span style={{ fontSize: 11, color: muted, flex: 1 }}>Photo attached</span>
          <button onClick={() => setPendingImage(null)} style={{
            background: "none", border: "none", color: "#ef4444", fontSize: 14, cursor: "pointer",
          }}>✕</button>
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: "10px 14px", borderTop: `1px solid ${border}`,
        background: card, display: "flex", gap: 8, alignItems: "center",
      }}>
        <label style={{ cursor: "pointer", fontSize: 20, flexShrink: 0, padding: "4px" }}>
          📷
          <input type="file" accept="image/*" style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => setPendingImage(reader.result);
              reader.readAsDataURL(file);
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
          disabled={loading || (!input.trim() && !pendingImage)}
          style={{
            padding: "10px 16px", borderRadius: 12,
            border: "none", background: accent,
            color: "#fff", fontSize: 13, fontWeight: 700,
            cursor: loading || (!input.trim() && !pendingImage) ? "default" : "pointer",
            opacity: loading || (!input.trim() && !pendingImage) ? 0.5 : 1,
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
