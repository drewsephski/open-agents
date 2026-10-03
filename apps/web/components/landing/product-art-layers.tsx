"use client";

import { motion, type MotionValue, useTransform } from "motion/react";
import Image from "next/image";
import styles from "./product-art.module.css";

const LAYERS = [
  {
    name: "bottom",
    restY: "15%",
    activeY: "22%",
    depth: 3,
    rotation: -1.5,
    className: styles.bottom,
  },
  {
    name: "middle",
    restY: "0%",
    activeY: "0%",
    depth: 8,
    rotation: 0,
    className: styles.middle,
  },
  {
    name: "top",
    restY: "-15%",
    activeY: "-22%",
    depth: 16,
    rotation: 1.5,
    className: styles.top,
  },
] as const;

interface ProductArtLayersProps {
  isExploring: boolean;
  prefersReducedMotion: boolean;
  pointerX: MotionValue<number>;
  pointerY: MotionValue<number>;
}

export function ProductArtLayers(props: ProductArtLayersProps) {
  return LAYERS.map((layer) => (
    <ProductArtLayer key={layer.name} layer={layer} {...props} />
  ));
}

function ProductArtLayer({
  layer,
  isExploring,
  prefersReducedMotion,
  pointerX,
  pointerY,
}: ProductArtLayersProps & { layer: (typeof LAYERS)[number] }) {
  const x = useTransform(pointerX, [-1, 1], [-layer.depth, layer.depth]);
  const y = useTransform(
    pointerY,
    [-1, 1],
    [-layer.depth / 2, layer.depth / 2],
  );

  return (
    <motion.div
      className={`${styles.layer} ${layer.className}`}
      initial={false}
      animate={{
        y: isExploring ? layer.activeY : layer.restY,
        rotate: isExploring ? layer.rotation : 0,
      }}
      transition={
        prefersReducedMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 100, damping: 24 }
      }
    >
      <motion.div
        className={styles.parallax}
        style={prefersReducedMotion ? undefined : { x, y }}
      >
        <div className={styles.float}>
          <Image
            src={`/brand/workspace-${layer.name}.webp`}
            alt={
              layer.name === "top"
                ? "Three floating graphite and glass workspace layers with an orange illuminated edge"
                : ""
            }
            aria-hidden={layer.name !== "top"}
            width={1254}
            height={1254}
            sizes="(min-width: 1024px) 40vw, (min-width: 640px) 420px, 80vw"
            className="h-auto w-full"
            priority
          />
        </div>
      </motion.div>
    </motion.div>
  );
}
