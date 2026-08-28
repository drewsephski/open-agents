"use client";

import { motion, useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";
import { useLayoutEffect, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";

export type SlidingTabBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const SLIDE_TRANSITION: Transition = {
  type: "spring",
  stiffness: 120,
  damping: 24,
  mass: 1.1,
};

const INSTANT_TRANSITION: Transition = { duration: 0 };

export function slidingTabProps(active: boolean) {
  return {
    "data-sliding-tab": "true",
    "data-active": active ? "true" : "false",
  } as const;
}

export function useSlidingTabBox(
  listRef: RefObject<HTMLElement | null>,
  activeKey: string,
): SlidingTabBox | null {
  const [box, setBox] = useState<SlidingTabBox | null>(null);

  useLayoutEffect(() => {
    const tabList = listRef.current;
    if (!tabList) {
      return;
    }

    function measure() {
      const list = listRef.current;
      if (!list) {
        return;
      }

      const active = list.querySelector<HTMLElement>(
        '[data-sliding-tab][data-active="true"]',
      );

      if (!active) {
        setBox(null);
        return;
      }

      setBox({
        x: active.offsetLeft,
        y: active.offsetTop,
        width: active.offsetWidth,
        height: active.offsetHeight,
      });
    }

    measure();

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(tabList);

    function observeTabs() {
      const list = listRef.current;
      if (!list) {
        return;
      }

      const tabs = list.querySelectorAll("[data-sliding-tab]");
      for (const tab of tabs) {
        resizeObserver.observe(tab);
      }
    }

    observeTabs();

    const mutationObserver = new MutationObserver(() => {
      observeTabs();
      measure();
    });
    mutationObserver.observe(tabList, { childList: true, subtree: true });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [activeKey, listRef]);

  return box;
}

type SlidingTabIndicatorProps = {
  box: SlidingTabBox | null;
  variant: "pill" | "underline";
  className?: string;
};

export function SlidingTabIndicator({
  box,
  variant,
  className,
}: SlidingTabIndicatorProps) {
  const shouldReduceMotion = useReducedMotion();
  const transition = shouldReduceMotion ? INSTANT_TRANSITION : SLIDE_TRANSITION;

  if (!box) {
    return null;
  }

  if (variant === "underline") {
    return (
      <motion.span
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-0 left-0 z-10 h-0.5 bg-foreground",
          className,
        )}
        initial={false}
        animate={{ x: box.x, width: box.width }}
        transition={transition}
      />
    );
  }

  return (
    <motion.span
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-0 left-0 rounded-[5px] bg-card shadow-sm",
        className,
      )}
      initial={false}
      animate={{
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      }}
      transition={transition}
    />
  );
}
