"use client";

import { Pause, Play } from "lucide-react";
import { motion } from "motion/react";
import { type PointerEvent, useState } from "react";
import { ProductArtLayers } from "./product-art-layers";
import { useProductArtMotion } from "./use-product-art-motion";
import styles from "./product-art.module.css";

export function ProductArt() {
  const [isHovered, setIsHovered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const {
    containerRef,
    canAnimate,
    prefersReducedMotion,
    pointerX,
    pointerY,
    rotateX,
    rotateY,
    resetPointer,
    movePointer,
  } = useProductArtMotion(isHovered || isPlaying);
  const isExploring = (isHovered || isPlaying) && canAnimate;

  function handlePointerEnter(event: PointerEvent<HTMLDivElement>) {
    if (
      event.pointerType === "mouse" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches
    ) {
      setIsHovered(true);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[420px] lg:max-w-[520px]">
      <div
        ref={containerRef}
        className={styles.art}
        data-exploring={isExploring}
        onPointerEnter={handlePointerEnter}
        onPointerMove={movePointer}
        onPointerLeave={() => {
          setIsHovered(false);
          resetPointer();
        }}
      >
        <motion.div
          className={styles.tilt}
          style={prefersReducedMotion ? undefined : { rotateX, rotateY }}
        >
          <div aria-hidden="true" className={styles.glow} />
          <ProductArtLayers
            isExploring={isExploring}
            prefersReducedMotion={Boolean(prefersReducedMotion)}
            pointerX={pointerX}
            pointerY={pointerY}
          />
        </motion.div>
      </div>
      <div className={`${styles.controls} mt-1 flex justify-center`}>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-(--l-border-subtle) px-4 text-xs text-(--l-fg-3) hover:border-(--l-border) hover:text-(--l-fg) focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--l-accent)"
          aria-label={
            isPlaying ? "Pause workspace animation" : "Play workspace animation"
          }
          aria-pressed={isPlaying}
          onClick={() => setIsPlaying((playing) => !playing)}
        >
          {isPlaying ? (
            <Pause aria-hidden="true" className="size-3" />
          ) : (
            <Play aria-hidden="true" className="size-3" />
          )}
          {isPlaying ? "Pause animation" : "Explore layers"}
        </button>
      </div>
    </div>
  );
}
