"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { PaperViewportProps } from "./types";
import styles from "./PaperViewport.module.css";

const CSS_PIXELS_PER_INCH = 96;

export function PaperViewport({
  profile,
  children,
  className,
  style,
  fitOnMobile = false,
  label,
}: PaperViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState({
    scale: 1,
    width: profile.widthIn * CSS_PIXELS_PER_INCH,
    height: profile.heightIn * CSS_PIXELS_PER_INCH,
  });

  useEffect(() => {
    if (!fitOnMobile) return;
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas) return;

    const measure = () => {
      if (!window.matchMedia("(max-width: 699px)").matches) return;
      const naturalWidth = Math.max(profile.widthIn * CSS_PIXELS_PER_INCH, canvas.scrollWidth);
      const naturalHeight = Math.max(profile.heightIn * CSS_PIXELS_PER_INCH, canvas.scrollHeight);
      const available = Math.max(1, viewport.clientWidth - 16);
      const scale = Math.min(1, available / naturalWidth);
      setGeometry({ scale, width: naturalWidth, height: naturalHeight });
    };

    const frame = window.requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(canvas);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("orientationchange", measure);
    };
  }, [fitOnMobile, profile.heightIn, profile.widthIn]);

  const sheetKitStyle = {
    "--sheetkit-scale": geometry.scale,
    "--sheetkit-paper-width": `${geometry.width}px`,
    "--sheetkit-stage-width": `${geometry.width * geometry.scale}px`,
    "--sheetkit-stage-height": `${geometry.height * geometry.scale}px`,
    ...style,
  } as CSSProperties;

  return (
    <div
      ref={viewportRef}
      className={`sheet-scroll ${styles.viewport}${className ? ` ${className}` : ""}`}
      data-paper-viewport=""
      data-paper-profile={profile.id}
      data-fit-mobile={fitOnMobile ? "true" : "false"}
      aria-label={label}
      style={sheetKitStyle}
    >
      <div className={styles.stage}>
        <div ref={canvasRef} className={styles.canvas}>
          {children}
        </div>
      </div>
    </div>
  );
}
