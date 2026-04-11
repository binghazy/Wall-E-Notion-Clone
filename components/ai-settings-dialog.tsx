"use client";

import { ReactNode, useEffect, useState } from "react";
import {
  Cloud,
  KeyRound,
  Monitor,
  RotateCcw,
  Save,
  Settings2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_WALLE_OLLAMA_BASE_URL,
  DEFAULT_WALLE_PROVIDER,
  WALLE_PUTER_MODELS,
  getDefaultModelForProvider,
  useAiSettings,
} from "@/hooks/use-ai-settings";
import { cn } from "@/lib/utils";

type AiSettingsDialogProps = {
  trigger?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSave?: () => void;
  requireName?: boolean;
  hideTrigger?: boolean;
};

export const AiSettingsDialog = ({
  trigger,
  open,
  defaultOpen,
  onOpenChange,
  onSave,
  requireName = false,
  hideTrigger = false,
}: AiSettingsDialogProps) => {
  const provider = useAiSettings((state) => state.provider);
  const apiKey = useAiSettings((state) => state.apiKey);
  const model = useAiSettings((state) => state.model);
  const ollamaBaseUrl = useAiSettings((state) => state.ollamaBaseUrl);
  const userName = useAiSettings((state) => state.userName);
  const updateSettings = useAiSettings((state) => state.updateSettings);
  const resetSettings = useAiSettings((state) => state.resetSettings);
  const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen ?? false);
  const isControlled = typeof open === "boolean";
  const isOpen = isControlled ? open : internalIsOpen;
  const setIsOpen = (nextOpen: boolean) => {
    if (!isControlled) {
      setInternalIsOpen(nextOpen);
    }

    onOpenChange?.(nextOpen);
  };
  const [draftProvider, setDraftProvider] = useState(provider);
  const [draftApiKey, setDraftApiKey] = useState(apiKey);
  const [draftModel, setDraftModel] = useState(
    model || getDefaultModelForProvider(provider),
  );
  const [draftOllamaBaseUrl, setDraftOllamaBaseUrl] = useState(
    ollamaBaseUrl || DEFAULT_WALLE_OLLAMA_BASE_URL,
  );
  const [draftUserName, setDraftUserName] = useState(userName);
  const normalizedDraftUserName = draftUserName.trim();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setDraftProvider(provider);
    setDraftApiKey(apiKey);
    setDraftModel(model || getDefaultModelForProvider(provider));
    setDraftOllamaBaseUrl(ollamaBaseUrl || DEFAULT_WALLE_OLLAMA_BASE_URL);
    setDraftUserName(userName);
  }, [apiKey, isOpen, model, ollamaBaseUrl, provider, userName]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {!hideTrigger ? (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button variant="outline" size="icon" aria-label="Open AI settings">
              <Settings2 className="h-4 w-4" />
            </Button>
          )}
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-w-xl rounded-3xl border px-0 py-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            AI Settings
          </DialogTitle>
          <DialogDescription>
            Switch between Wall-E AI, Gemini cloud, and local Ollama.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-6">
          <div className="space-y-2">
            <Label htmlFor="walle-user-name">Your Name</Label>
            <Input
              id="walle-user-name"
              value={draftUserName}
              onChange={(event) => setDraftUserName(event.target.value)}
              placeholder="Type your name..."
              className="h-11 rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              Wall-E can personalize responses using this name.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Provider</Label>
            <div className="grid grid-cols-3 gap-2 rounded-2xl border p-2">
              <button
                type="button"
                onClick={() => {
                  setDraftProvider("puter");
                  setDraftModel(getDefaultModelForProvider("puter"));
                }}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm transition",
                  draftProvider === "puter"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/40 hover:bg-muted",
                )}
              >
                <Cloud className="h-4 w-4" />
                Wall-E AI
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftProvider("gemini");
                  setDraftModel(getDefaultModelForProvider("gemini"));
                }}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm transition",
                  draftProvider === "gemini"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/40 hover:bg-muted",
                )}
              >
                <Cloud className="h-4 w-4" />
                Cloud Gemini
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftProvider("ollama");
                  setDraftModel(getDefaultModelForProvider("ollama"));
                }}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm transition",
                  draftProvider === "ollama"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/40 hover:bg-muted",
                )}
              >
                <Monitor className="h-4 w-4" />
                Local Ollama
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="walle-model">Model</Label>
            {draftProvider === "puter" ? (
              <select
                id="walle-model"
                value={draftModel}
                onChange={(event) => setDraftModel(event.target.value)}
                className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
              >
                {WALLE_PUTER_MODELS.map((modelOption) => (
                  <option key={modelOption} value={modelOption}>
                    {modelOption}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id="walle-model"
                value={draftModel}
                onChange={(event) => setDraftModel(event.target.value)}
                placeholder={getDefaultModelForProvider(draftProvider)}
                className="h-11 rounded-xl"
              />
            )}
            <p className="text-xs text-muted-foreground">
              {draftProvider === "ollama"
                ? "Example: `qwen3:4b`, `llama3.1:8b`, or another local Ollama model tag."
                : draftProvider === "gemini"
                  ? "Gemini examples: `gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-pro`."
                  : "Wall-E cloud models: `gpt-5-nano`, `gpt-5.4-nano`."}
            </p>
          </div>

          {draftProvider === "gemini" ? (
            <div className="space-y-2">
              <Label htmlFor="walle-api-key">Gemini API Key</Label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="walle-api-key"
                  type="password"
                  value={draftApiKey}
                  onChange={(event) => setDraftApiKey(event.target.value)}
                  placeholder="AIza..."
                  className="h-11 rounded-xl pl-10"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Leave empty to use the server Gemini key.
              </p>
            </div>
          ) : draftProvider === "puter" ? (
            <div className="rounded-2xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              Wall-E auth is managed, Now it is ready to use.
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="walle-ollama-url">Ollama Base URL</Label>
              <Input
                id="walle-ollama-url"
                value={draftOllamaBaseUrl}
                onChange={(event) => setDraftOllamaBaseUrl(event.target.value)}
                placeholder={DEFAULT_WALLE_OLLAMA_BASE_URL}
                className="h-11 rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                Usually `http://localhost:11434`.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              resetSettings();
              setDraftProvider(DEFAULT_WALLE_PROVIDER);
              setDraftApiKey("");
              setDraftModel(getDefaultModelForProvider(DEFAULT_WALLE_PROVIDER));
              setDraftOllamaBaseUrl(DEFAULT_WALLE_OLLAMA_BASE_URL);
              setDraftUserName("");
            }}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <Button
            type="button"
            disabled={requireName && normalizedDraftUserName.length === 0}
            onClick={() => {
              updateSettings({
                provider: draftProvider,
                apiKey: draftApiKey,
                model: draftModel,
                ollamaBaseUrl: draftOllamaBaseUrl,
                userName: normalizedDraftUserName,
              });
              onSave?.();
              setIsOpen(false);
            }}
          >
            <Save className="mr-2 h-4 w-4" />
            Save settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
