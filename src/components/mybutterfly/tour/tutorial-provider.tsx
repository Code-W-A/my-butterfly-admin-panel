"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { usePathname, useRouter } from "next/navigation";

import { createPortal } from "react-dom";

import { type TutorialStep, tutorialSteps } from "@/components/mybutterfly/tour/tutorial-steps";

type TutorialContextValue = {
  startTour: () => void;
  stopTour: () => void;
  isRunning: boolean;
};

const TutorialContext = createContext<TutorialContextValue | null>(null);

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [targetFound, setTargetFound] = useState(false);
  const stepRef = useRef<TutorialStep | null>(null);

  const isDebugEnabled = useCallback(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem("tourDebug") === "1";
    } catch {
      return false;
    }
  }, []);

  const startTour = useCallback(() => {
    if (run) return;
    if (isDebugEnabled()) {
      console.log("[tour] start", { steps: tutorialSteps.length });
    }
    setStepIndex(0);
    setRun(true);
  }, [run, isDebugEnabled]);

  const stopTour = useCallback(() => {
    if (isDebugEnabled()) {
      console.log("[tour] stop");
    }
    setRun(false);
    setStepIndex(0);
    setRect(null);
    setTargetFound(false);
  }, [isDebugEnabled]);

  const goNext = useCallback(() => {
    setStepIndex((prev) => {
      const next = prev + 1;
      if (isDebugEnabled()) {
        console.log("[tour] next", { from: prev, to: next });
      }
      if (next >= tutorialSteps.length) {
        stopTour();
        return prev;
      }
      const step = tutorialSteps[next];
      if (step?.route && pathname !== step.route) {
        router.push(step.route);
        if (isDebugEnabled()) {
          console.log("[tour] route ->", step.route);
        }
      }
      return next;
    });
  }, [pathname, router, stopTour, isDebugEnabled]);

  const goPrev = useCallback(() => {
    setStepIndex((prev) => {
      const next = Math.max(prev - 1, 0);
      if (isDebugEnabled()) {
        console.log("[tour] prev", { from: prev, to: next });
      }
      const step = tutorialSteps[next];
      if (step?.route && pathname !== step.route) {
        router.push(step.route);
        if (isDebugEnabled()) {
          console.log("[tour] route ->", step.route);
        }
      }
      return next;
    });
  }, [pathname, router, isDebugEnabled]);

  const value = useMemo(() => ({ startTour, stopTour, isRunning: run }), [startTour, stopTour, run]);

  useEffect(() => {
    if (!run) return;

    const step = tutorialSteps[stepIndex];
    stepRef.current = step ?? null;

    const compute = () => {
      const s = stepRef.current;
      if (!s) return;
      const el = document.querySelector(s.target) as HTMLElement | null;
      if (!el) {
        setTargetFound(false);
        setRect(null);
        if (isDebugEnabled()) {
          console.log("[tour] target not found", { stepIndex, target: s.target, href: window.location.href });
        }
        return;
      }
      const r = el.getBoundingClientRect();
      setTargetFound(true);
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      if (isDebugEnabled()) {
        console.log("[tour] target found", {
          stepIndex,
          target: s.target,
          rect: { top: r.top, left: r.left, w: r.width, h: r.height },
        });
      }
    };

    compute();
    const onScroll = () => compute();
    const onResize = () => compute();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [run, stepIndex, isDebugEnabled]);

  useEffect(() => {
    if (!run) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") stopTour();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [run, stopTour]);

  const overlay = useMemo(() => {
    if (!run) return null;
    const step = tutorialSteps[stepIndex];
    if (!step) return null;

    const placement = step.placement ?? "bottom";
    const padding = 8;
    const highlight = rect
      ? {
          top: Math.max(rect.top - padding, 8),
          left: Math.max(rect.left - padding, 8),
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
        }
      : null;

    const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;

    const tooltipWidth = 380;
    const tooltipX = highlight
      ? clamp(highlight.left, 12, vw - tooltipWidth - 12)
      : clamp(vw / 2 - tooltipWidth / 2, 12, vw - tooltipWidth - 12);
    const tooltipY = (() => {
      if (!highlight) return vh / 2 - 120;
      if (placement === "top") return clamp(highlight.top - 16 - 140, 12, vh - 220);
      if (placement === "left") return clamp(highlight.top, 12, vh - 220);
      if (placement === "right") return clamp(highlight.top, 12, vh - 220);
      return clamp(highlight.top + highlight.height + 16, 12, vh - 220);
    })();

    return createPortal(
      <div className="fixed inset-0 z-[9999]">
        {highlight ? (
          <div
            className="absolute rounded-lg border-2 border-primary bg-transparent"
            style={{
              top: highlight.top,
              left: highlight.left,
              width: highlight.width,
              height: highlight.height,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
              pointerEvents: "none",
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-black/50" />
        )}

        <div
          className="absolute w-[380px] rounded-lg border bg-background p-4 shadow-lg"
          style={{ top: tooltipY, left: tooltipX }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm">{step.content}</div>
            <button
              type="button"
              onClick={stopTour}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close tour"
            >
              ×
            </button>
          </div>

          {!targetFound ? (
            <div className="mt-2 text-muted-foreground text-xs">
              Elementul nu este pe această pagină. Navighează la pagina potrivită sau apasă Next ca să continui.
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-between">
            <div className="text-muted-foreground text-xs">
              Pas {stepIndex + 1} din {tutorialSteps.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goPrev}
                disabled={stepIndex === 0}
                className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={goNext}
                className="rounded-md bg-primary px-3 py-1 text-primary-foreground text-sm"
              >
                {stepIndex + 1 >= tutorialSteps.length ? "Finish" : "Next"}
              </button>
              <button type="button" onClick={stopTour} className="rounded-md border px-3 py-1 text-sm">
                Skip
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  }, [goNext, goPrev, rect, run, stepIndex, stopTour, targetFound]);

  return (
    <TutorialContext.Provider value={value}>
      {children}
      {overlay}
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  const ctx = useContext(TutorialContext);
  if (!ctx) {
    throw new Error("useTutorial must be used within TutorialProvider.");
  }
  return ctx;
}
