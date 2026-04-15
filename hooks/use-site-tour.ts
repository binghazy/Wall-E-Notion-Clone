"use client";

import { useCallback } from "react";
import type { DriveStep } from "driver.js";

type WallETourKind = "home" | "document";
type StartTourOptions = {
  force?: boolean;
};
const TOUR_IMAGE_MAX_HEIGHT_PX = 220;
const TOUR_IMAGE_PRELOAD_TIMEOUT_MS = 2500;
const TELE_PIC_1 = "https://i.imgur.com/9KDJ31C.png";
const TELE_PIC_2 = "https://i.imgur.com/X9eNLFC.png";
const COMPOSER_TOUR_IMAGE_URL = "https://i.imgur.com/fIF0kjM.png";

const first_tour_finished =
  "https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExd2Y4Y3RsOTNha3o4azRqbGE0ZGZ5am84OTE0emN1dDlnOXNuNjBzbyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/cC4jUAUPDQ91K/giphy.gif";
const TOUR_STORAGE_KEY_PREFIX = "walle-site-tour-complete";
const TOUR_FINISH_GIF_URL =
  "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExdjQ5aDVyM2xydTZmMW4ya3h6Nmpya2l2eDB4dnBpYnpybDQ1MTJpdyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/JAAot6yVvkHni/giphy.gif";

const buildTourImageHtml = (imageUrl: string) => `
  <div style="display:flex;flex-direction:column;gap:10px;">
    <img
      src="${imageUrl}"
      width="640"
      height="${TOUR_IMAGE_MAX_HEIGHT_PX}"
      loading="eager"
      decoding="async"
      style="display:block;width:100%;height:auto;max-height:${TOUR_IMAGE_MAX_HEIGHT_PX}px;object-fit:contain;border-radius:12px;background:rgba(15,23,42,0.04);"
    />
  </div>
`;

const tele1 = buildTourImageHtml(TELE_PIC_1);
const tele2 = buildTourImageHtml(TELE_PIC_2);
const COMPOSER_TOUR_HTML = buildTourImageHtml(COMPOSER_TOUR_IMAGE_URL);
const First_Tour_HTML = buildTourImageHtml(first_tour_finished);
const TOUR_FINISH_HTML = buildTourImageHtml(TOUR_FINISH_GIF_URL);

const TOUR_IMAGE_URLS = [
  TELE_PIC_1,
  TELE_PIC_2,
  COMPOSER_TOUR_IMAGE_URL,
  first_tour_finished,
  TOUR_FINISH_GIF_URL,
];

const preloadTourImage = (imageUrl: string) => {
  return new Promise<void>((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => {
      resolve();
    }, TOUR_IMAGE_PRELOAD_TIMEOUT_MS);

    const finish = () => {
      window.clearTimeout(timer);
      resolve();
    };

    image.onload = finish;
    image.onerror = finish;
    image.src = imageUrl;
  });
};

const preloadTourImages = async () => {
  await Promise.all(TOUR_IMAGE_URLS.map(preloadTourImage));
};

const HOME_TOUR_STEPS: DriveStep[] = [
  {
    popover: {
      title: "Welcome to Wall-E AI",
      description:
        "Create notes and use AI in one connected place. Start by creating a new note.",
    },
  },
  {
    element: '[data-tour="home-create-note"]',
    popover: {
      title: "Create a note",
      description:
        "Click this to make a new note. Then open it and start writing.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="shell-pages-list"]',
    popover: {
      title: "Everything stays connected",
      description:
        "Your notes, AI composer, and Wall-E chat all work together in one place.",
      side: "right",
      align: "start",
    },
  },

  {
    element: '[data-tour="home-telegram-link"]',
    popover: {
      title: "We Got Wall-E On Telegram Too !",
      description: tele2,
      side: "bottom",
      align: "start",
    },
  },

  {
    popover: {
      title: "Scan This QR Code to See Our Bot On Telegram",
      description: tele1,
      side: "bottom",
      align: "start",
    },
  },

  {
    element: '[data-tour="home-create-note"]',
    popover: {
      title: "Let's Make a Note To Start!",
      description: First_Tour_HTML,
    },
  },
];

const DOCUMENT_TOUR_STEPS: DriveStep[] = [
  {
    popover: {
      title: "Document tutorial",
      description:
        "Make your note, use AI composer, and chat with Wall-E. They are connected to the same note.",
    },
  },
  {
    element: '[data-tour="document-title-input"]',
    popover: {
      title: "Name your note",
      description:
        "Set a clear title here so your note stays easy to find in the sidebar.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="document-editor"]',
    popover: {
      title: "Use This Space To Write your ideas",
      description:
        "Write anything you want here. This is your canvas. You can also use the AI composer to generate content and ideas right here in the editor.",
      side: "top",
      align: "start",
    },
  },
  {
    element: '[data-tour="document-editor"]',
    popover: {
      title: "Use Composer To Generate Content For You",
      description: COMPOSER_TOUR_HTML,
      side: "top",
      align: "start",
    },
  },
  {
    element: '[data-tour="document-ai-toggle"]',
    popover: {
      title: "Open Wall-E and text it",
      description:
        "Use this floating button to text Wall-E. The chat and AI composer both update this same note in one place.",
      side: "left",
      align: "center",
    },
  },
  {
    popover: {
      title: "You are ready Now !",
      description: TOUR_FINISH_HTML,
    },
  },
];

const getStorageKey = (tourKind: WallETourKind) =>
  `${TOUR_STORAGE_KEY_PREFIX}:${tourKind}`;

const getStepsForTourKind = (tourKind: WallETourKind) => {
  return tourKind === "home" ? HOME_TOUR_STEPS : DOCUMENT_TOUR_STEPS;
};

const resolveMountedSteps = (steps: DriveStep[]) => {
  return steps.filter((step) => {
    if (!step.element) {
      return true;
    }

    if (typeof step.element !== "string") {
      return true;
    }

    return Boolean(document.querySelector(step.element));
  });
};

export const useSiteTour = (tourKind: WallETourKind) => {
  const startTour = useCallback(
    async ({ force = false }: StartTourOptions = {}) => {
      if (typeof window === "undefined") {
        return;
      }

      const storageKey = getStorageKey(tourKind);

      if (!force && window.localStorage.getItem(storageKey) === "true") {
        return;
      }

      const { driver } = await import("driver.js");
      const steps = resolveMountedSteps(getStepsForTourKind(tourKind));

      if (steps.length === 0) {
        return;
      }

      await preloadTourImages();

      let removeEnterKeyListener: (() => void) | null = null;
      const tour = driver({
        steps,
        showProgress: true,
        animate: true,
        allowClose: true,
        overlayOpacity: 0.55,
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Done",
        onPopoverRender: (popover, { driver: currentDriver }) => {
          const popoverImages = popover.description.querySelectorAll("img");

          popoverImages.forEach((image) => {
            if (image.complete) {
              return;
            }

            const refreshPopoverPlacement = () => {
              currentDriver.refresh();
            };

            image.addEventListener("load", refreshPopoverPlacement, {
              once: true,
            });
            image.addEventListener("error", refreshPopoverPlacement, {
              once: true,
            });
          });
        },
        onDestroyed: () => {
          removeEnterKeyListener?.();
          window.localStorage.setItem(storageKey, "true");
        },
      });

      const handleEnterToNextStep = (event: KeyboardEvent) => {
        if (event.key !== "Enter" || event.defaultPrevented) {
          return;
        }

        if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
          return;
        }

        if (!tour.isActive()) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (tour.hasNextStep()) {
          tour.moveNext();
          return;
        }

        tour.destroy();
      };

      window.addEventListener("keydown", handleEnterToNextStep, true);
      removeEnterKeyListener = () => {
        window.removeEventListener("keydown", handleEnterToNextStep, true);
      };

      tour.drive();
    },
    [tourKind],
  );

  const resetTour = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(getStorageKey(tourKind));
  }, [tourKind]);

  return {
    startTour,
    resetTour,
  };
};
