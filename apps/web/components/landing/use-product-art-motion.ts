"use client";

import { useInView, useSpring, useTransform } from "motion/react";
import {
  type PointerEvent,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

const POINTER_SPRING = { stiffness: 100, damping: 24 };

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getReducedMotionSnapshot() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getServerReducedMotionSnapshot() {
  return true;
}

export function useProductArtMotion(isInteracting: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef);
  const prefersReducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getServerReducedMotionSnapshot,
  );
  const [isPageVisible, setIsPageVisible] = useState(true);
  const pointerX = useSpring(0, POINTER_SPRING);
  const pointerY = useSpring(0, POINTER_SPRING);
  const rotateX = useTransform(pointerY, [-1, 1], [7, -7]);
  const rotateY = useTransform(pointerX, [-1, 1], [-9, 9]);
  const canAnimate = !prefersReducedMotion && isInView && isPageVisible;
  const isActive = isInteracting && canAnimate;

  useEffect(() => {
    const updateVisibility = () => setIsPageVisible(!document.hidden);
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () =>
      document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    if (!isActive) {
      if (canAnimate) {
        pointerX.set(0);
        pointerY.set(0);
      } else {
        pointerX.jump(0);
        pointerY.jump(0);
      }
    }
  }, [isActive, canAnimate, pointerX, pointerY]);

  function resetPointer() {
    pointerX.set(0);
    pointerY.set(0);
  }

  function movePointer(event: PointerEvent<HTMLDivElement>) {
    if (!isActive || event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set(
      Math.max(
        -1,
        Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2),
      ),
    );
    pointerY.set(
      Math.max(
        -1,
        Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2),
      ),
    );
  }

  return {
    containerRef,
    canAnimate,
    prefersReducedMotion,
    pointerX,
    pointerY,
    rotateX,
    rotateY,
    resetPointer,
    movePointer,
  };
}
