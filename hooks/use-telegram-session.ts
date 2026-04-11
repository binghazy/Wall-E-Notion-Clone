"use client";

import { useEffect, useMemo, useState } from "react";

const TELEGRAM_SESSION_STORAGE_KEY = "walle-telegram-session-id";

const createSessionId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
};

const readOrCreateSessionId = () => {
  if (typeof window === "undefined") {
    return "";
  }

  const existingSessionId = window.localStorage.getItem(
    TELEGRAM_SESSION_STORAGE_KEY,
  );

  if (existingSessionId) {
    return existingSessionId;
  }

  const nextSessionId = createSessionId();
  window.localStorage.setItem(TELEGRAM_SESSION_STORAGE_KEY, nextSessionId);
  return nextSessionId;
};

export const useTelegramSession = () => {
  const [sessionId, setSessionId] = useState("");

  useEffect(() => {
    setSessionId(readOrCreateSessionId());
  }, []);

  const telegramCommand = useMemo(() => {
    if (!sessionId) {
      return "";
    }

    return `/session ${sessionId}`;
  }, [sessionId]);

  return {
    sessionId,
    telegramCommand,
  };
};
