"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";

type ReasoningChatMessageProps = {
  message: string;
  isStreaming: boolean;
};

type ParsedReasoningMessage = {
  thoughtBlocks: string[];
  finalAnswer: string;
  hasUnclosedThink: boolean;
  unclosedThought: string;
};

const parseReasoningMessage = (input: string): ParsedReasoningMessage => {
  const source = typeof input === "string" ? input : "";
  const openTagRegex = /<\s*think\s*>/gi;
  const closeTagRegex = /<\s*\/\s*think\s*>/gi;

  const thoughtBlocks: string[] = [];
  const answerParts: string[] = [];

  let cursor = 0;
  let hasUnclosedThink = false;
  let unclosedThought = "";

  while (cursor < source.length) {
    openTagRegex.lastIndex = cursor;
    const openTagMatch = openTagRegex.exec(source);

    if (!openTagMatch) {
      answerParts.push(source.slice(cursor));
      break;
    }

    const openTagIndex = openTagMatch.index;
    if (openTagIndex > cursor) {
      answerParts.push(source.slice(cursor, openTagIndex));
    }

    const thoughtStart = openTagIndex + openTagMatch[0].length;
    closeTagRegex.lastIndex = thoughtStart;
    const closeTagMatch = closeTagRegex.exec(source);

    if (!closeTagMatch) {
      hasUnclosedThink = true;
      unclosedThought = source.slice(thoughtStart).trim();
      break;
    }

    const closeTagIndex = closeTagMatch.index;
    const thoughtText = source.slice(thoughtStart, closeTagIndex).trim();
    if (thoughtText.length > 0) {
      thoughtBlocks.push(thoughtText);
    }

    cursor = closeTagIndex + closeTagMatch[0].length;
  }

  return {
    thoughtBlocks,
    finalAnswer: answerParts.join("").trim(),
    hasUnclosedThink,
    unclosedThought,
  };
};

export const ReasoningChatMessage = ({
  message,
  isStreaming,
}: ReasoningChatMessageProps) => {
  const parsed = useMemo(() => parseReasoningMessage(message), [message]);
  const thoughtStartedAtRef = useRef<number | null>(null);
  const [thoughtDurationSeconds, setThoughtDurationSeconds] = useState<
    number | null
  >(null);

  const shouldPromoteUnclosedThoughtToAnswer =
    !isStreaming &&
    parsed.hasUnclosedThink &&
    parsed.finalAnswer.length === 0 &&
    parsed.unclosedThought.trim().length > 0;

  const hasIncompleteThoughtBlock =
    !isStreaming &&
    parsed.hasUnclosedThink &&
    !shouldPromoteUnclosedThoughtToAnswer &&
    parsed.unclosedThought.trim().length > 0;

  const thoughtBlocksToRender = hasIncompleteThoughtBlock
    ? [...parsed.thoughtBlocks, parsed.unclosedThought]
    : parsed.thoughtBlocks;

  const finalAnswerText = shouldPromoteUnclosedThoughtToAnswer
    ? parsed.unclosedThought
    : parsed.finalAnswer;

  const showThinking =
    isStreaming &&
    parsed.hasUnclosedThink &&
    finalAnswerText.trim().length === 0;
  const showThoughtProcess = thoughtBlocksToRender.length > 0;
  const showFinalAnswer = finalAnswerText.length > 0;
  const thoughtSummaryLabel =
    thoughtDurationSeconds !== null
      ? `Thought for ${thoughtDurationSeconds}s`
      : "Thought Process";

  useEffect(() => {
    const hasAnyThoughtContent =
      parsed.thoughtBlocks.length > 0 || parsed.unclosedThought.length > 0;
    const isActivelyThinking = isStreaming && parsed.hasUnclosedThink;

    if (!hasAnyThoughtContent) {
      thoughtStartedAtRef.current = null;
      setThoughtDurationSeconds(null);
      return;
    }

    if (isActivelyThinking && thoughtStartedAtRef.current === null) {
      thoughtStartedAtRef.current = Date.now();
    }

    // Finalize timer once thinking closes (even if final answer is still streaming).
    if (!parsed.hasUnclosedThink && parsed.thoughtBlocks.length > 0) {
      if (thoughtStartedAtRef.current !== null) {
        const elapsedSeconds = Math.max(
          1,
          Math.round((Date.now() - thoughtStartedAtRef.current) / 1000),
        );

        setThoughtDurationSeconds((current) => {
          return current === elapsedSeconds ? current : elapsedSeconds;
        });
      }
    }
  }, [isStreaming, parsed.hasUnclosedThink, parsed.thoughtBlocks, parsed.unclosedThought]);

  return (
    <div className="space-y-3">
      {showThinking && (
        <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/80 px-3 py-1.5 text-xs font-medium text-muted-foreground dark:border-white/10 dark:bg-white/10">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="animate-pulse">Thinking...</span>
        </div>
      )}

      {showThoughtProcess && (
        <details className="group overflow-hidden rounded-xl border border-border/70 bg-muted/70 dark:border-white/10 dark:bg-white/5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm transition [&::-webkit-details-marker]:hidden">
            <span className="font-medium text-muted-foreground">
              {thoughtSummaryLabel}
              {hasIncompleteThoughtBlock ? " (incomplete)" : ""}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-foreground transition-transform group-open:rotate-90" />
          </summary>

          <div className="border-t border-border/70 bg-background/50 px-3 py-3 dark:border-white/10 dark:bg-black/20">
            <div className="space-y-3 border-l-2 border-muted-foreground/35 pl-3 text-sm text-foreground/90">
              {thoughtBlocksToRender.map((block, index) => (
                <pre
                  key={`thought-${index}`}
                  className="whitespace-pre-wrap break-words font-sans leading-6"
                >
                  {block}
                </pre>
              ))}
            </div>
          </div>
        </details>
      )}

      {showFinalAnswer && (
        <div className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
          {finalAnswerText}
        </div>
      )}
    </div>
  );
};
