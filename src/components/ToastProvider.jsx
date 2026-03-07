import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { useThemeStore } from "../stores/themeStore.js";

const ToastContext = createContext(null);

let nextId = 0;

const TOAST_TYPES = {
  success: { color: "#22c55e", bg: "#052e16", icon: "\u2713" },
  error:   { color: "#ef4444", bg: "#450a0a", icon: "\u2717" },
  info:    { color: "#3b82f6", bg: "#172554", icon: "\u2139" },
  warning: { color: "#f59e0b", bg: "#451a03", icon: "\u26A0" },
};

const TOAST_TYPES_LIGHT = {
  success: { color: "#15803d", bg: "#dcfce7", icon: "\u2713" },
  error:   { color: "#dc2626", bg: "#fee2e2", icon: "\u2717" },
  info:    { color: "#2563eb", bg: "#dbeafe", icon: "\u2139" },
  warning: { color: "#d97706", bg: "#fef3c7", icon: "\u26A0" },
};

export function useToast() {
  return useContext(ToastContext);
}

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});
  const { mode } = useThemeStore();
  const isDark = mode === "dark";

  const addToast = useCallback((message, type = "info", duration = 3000) => {
    const id = ++nextId;
    setToasts(prev => [...prev, { id, message, type, createdAt: Date.now(), duration }]);
    timersRef.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      delete timersRef.current[id];
    }, duration);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  }, []);

  const types = isDark ? TOAST_TYPES : TOAST_TYPES_LIGHT;

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      {/* Toast container */}
      <div style={{
        position: "fixed", bottom: 20, right: 20, zIndex: 1300,
        display: "flex", flexDirection: "column-reverse", gap: 8,
        pointerEvents: "none", maxWidth: 380,
      }}>
        {toasts.map(toast => {
          const cfg = types[toast.type] ?? types.info;
          const elapsed = Date.now() - toast.createdAt;
          const remaining = Math.max(0, toast.duration - elapsed);
          return (
            <div
              key={toast.id}
              style={{
                padding: "10px 14px", borderRadius: 10,
                background: cfg.bg, color: cfg.color,
                border: `1px solid ${cfg.color}33`,
                fontSize: 13, fontWeight: 500,
                display: "flex", alignItems: "center", gap: 8,
                pointerEvents: "auto", cursor: "pointer",
                boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                animation: "wa-toast-in 0.2s ease-out",
              }}
              onClick={() => removeToast(toast.id)}
            >
              <span style={{ fontSize: 15, flexShrink: 0 }}>{cfg.icon}</span>
              <span style={{ flex: 1 }}>{toast.message}</span>
              <span style={{ fontSize: 11, opacity: 0.6, flexShrink: 0 }}>&times;</span>
              {/* Countdown bar */}
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0, height: 3,
                borderRadius: "0 0 10px 10px", overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", background: cfg.color,
                  opacity: 0.4,
                  width: "100%",
                  animation: `wa-toast-countdown ${toast.duration}ms linear forwards`,
                }} />
              </div>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes wa-toast-in {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes wa-toast-countdown {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
