"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const WALLE_AI_PROVIDERS = ["puter", "gemini", "ollama"] as const;
export const WALLE_PUTER_MODELS = ["gpt-5-nano", "gpt-5.4-nano"] as const;

export type WallEAiProvider = (typeof WALLE_AI_PROVIDERS)[number];
export type WallEPuterModel = (typeof WALLE_PUTER_MODELS)[number];

export const DEFAULT_WALLE_PROVIDER: WallEAiProvider = "puter";
export const DEFAULT_WALLE_PUTER_MODEL = "gpt-5-nano";
export const DEFAULT_WALLE_GEMINI_MODEL = "gemini-2.5-flash";
export const DEFAULT_WALLE_LOCAL_MODEL = "qwen3:4b";
export const DEFAULT_WALLE_MODEL = DEFAULT_WALLE_PUTER_MODEL;
export const DEFAULT_WALLE_OLLAMA_BASE_URL = "http://localhost:11434";

const normalizeSetting = (value: string | undefined) => value?.trim() ?? "";

const isValidPuterModel = (value: string): value is WallEPuterModel => {
  return WALLE_PUTER_MODELS.includes(value as WallEPuterModel);
};

const normalizeProvider = (value: string | undefined): WallEAiProvider => {
  const normalizedValue = normalizeSetting(value).toLowerCase();

  if (
    normalizedValue &&
    WALLE_AI_PROVIDERS.includes(normalizedValue as WallEAiProvider)
  ) {
    return normalizedValue as WallEAiProvider;
  }

  return DEFAULT_WALLE_PROVIDER;
};

export const getDefaultModelForProvider = (provider: WallEAiProvider) => {
  if (provider === "ollama") {
    return DEFAULT_WALLE_LOCAL_MODEL;
  }

  if (provider === "gemini") {
    return DEFAULT_WALLE_GEMINI_MODEL;
  }

  return DEFAULT_WALLE_PUTER_MODEL;
};

const normalizeModelForProvider = (
  provider: WallEAiProvider,
  value: string | undefined,
) => {
  const normalizedModel = normalizeSetting(value);

  if (provider === "puter") {
    return isValidPuterModel(normalizedModel)
      ? normalizedModel
      : DEFAULT_WALLE_PUTER_MODEL;
  }

  return normalizedModel || getDefaultModelForProvider(provider);
};

export type AiSettingsSnapshot = {
  provider: WallEAiProvider;
  apiKey: string;
  model: string;
  ollamaBaseUrl: string;
  userName: string;
};

type AiSettingsStore = AiSettingsSnapshot & {
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  updateSettings: (updates: Partial<AiSettingsSnapshot>) => void;
  resetSettings: () => void;
};

export const getResolvedAiSettings = (
  settings: Partial<AiSettingsSnapshot>,
) => {
  const provider = normalizeProvider(settings.provider);

  return {
    provider,
    apiKey: normalizeSetting(settings.apiKey),
    model: normalizeModelForProvider(provider, settings.model),
    ollamaBaseUrl:
      normalizeSetting(settings.ollamaBaseUrl) || DEFAULT_WALLE_OLLAMA_BASE_URL,
    userName: normalizeSetting(settings.userName),
  };
};

export const useAiSettings = create<AiSettingsStore>()(
  persist(
    (set) => ({
      provider: DEFAULT_WALLE_PROVIDER,
      apiKey: "",
      model: getDefaultModelForProvider(DEFAULT_WALLE_PROVIDER),
      ollamaBaseUrl: DEFAULT_WALLE_OLLAMA_BASE_URL,
      userName: "",
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      updateSettings: (updates) =>
        set((state) => {
          const provider =
            updates.provider !== undefined
              ? normalizeProvider(updates.provider)
              : state.provider;

          return {
            provider,
            apiKey:
              updates.apiKey !== undefined
                ? normalizeSetting(updates.apiKey)
                : state.apiKey,
            model:
              updates.model !== undefined
                ? normalizeModelForProvider(provider, updates.model)
                : normalizeModelForProvider(provider, state.model),
            ollamaBaseUrl:
              updates.ollamaBaseUrl !== undefined
                ? normalizeSetting(updates.ollamaBaseUrl) ||
                  DEFAULT_WALLE_OLLAMA_BASE_URL
                : state.ollamaBaseUrl,
            userName:
              updates.userName !== undefined
                ? normalizeSetting(updates.userName)
                : state.userName,
          };
        }),
      resetSettings: () =>
        set({
          provider: DEFAULT_WALLE_PROVIDER,
          apiKey: "",
          model: getDefaultModelForProvider(DEFAULT_WALLE_PROVIDER),
          ollamaBaseUrl: DEFAULT_WALLE_OLLAMA_BASE_URL,
          userName: "",
        }),
    }),
    {
      name: "Wall-E AI-settings",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
      partialize: (state) => ({
        provider: state.provider,
        apiKey: state.apiKey,
        model: state.model,
        ollamaBaseUrl: state.ollamaBaseUrl,
        userName: state.userName,
      }),
    },
  ),
);
