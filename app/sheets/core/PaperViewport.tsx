"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
} from "react";
import type { PaperViewportProps } from "./types";
import styles from "./PaperViewport.module.css";

const CSS_PIXELS_PER_INCH = 96;
const MOBILE_QUERY = "(max-width: 699px)";
const DOUBLE_TAP_DELAY_MS = 320;
const DOUBLE_TAP_DISTANCE_PX = 28;

type MobilePaperView = "actual" | "fit";

interface PendingFocus {
  naturalX: number;
  naturalY: number;
  localX: number;
  localY: number;
}

export function PaperViewport({
  profile,
  children,
  className,
  style,
  fitOnMobile = false,
  mobileViewer = false,
  label,
}: PaperViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef<PendingFocus | null>(null);
  const lastTapRef = useRef({ at: 0, x: 0, y: 0 });
  const [mobileView, setMobileView] = useState<MobilePaperView>("actual");
  const [geometry, setGeometry] = useState({
    scale: 1,
    width: profile.widthIn * CSS_PIXELS_PER_INCH,
    height: profile.heightIn * CSS_PIXELS_PER_INCH,
    viewportHeight: profile.heightIn * CSS_PIXELS_PER_INCH,
  });

  useEffect(() => {
    if (!fitOnMobile && !mobileViewer) return;
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas) return;

    const measure = () => {
      if (!window.matchMedia(MOBILE_QUERY).matches) {
        const nextGeometry = {
          scale: 1,
          width: profile.widthIn * CSS_PIXELS_PER_INCH,
          height: profile.heightIn * CSS_PIXELS_PER_INCH,
          viewportHeight: profile.heightIn * CSS_PIXELS_PER_INCH,
        };
        setGeometry((current) =>
          current.scale === nextGeometry.scale
          && current.width === nextGeometry.width
          && current.height === nextGeometry.height
          && current.viewportHeight === nextGeometry.viewportHeight
            ? current
            : nextGeometry,
        );
        return;
      }

      const naturalWidth = Math.max(profile.widthIn * CSS_PIXELS_PER_INCH, canvas.scrollWidth);
      const naturalHeight = Math.max(profile.heightIn * CSS_PIXELS_PER_INCH, canvas.scrollHeight);
      const availableWidth = Math.max(1, viewport.clientWidth - 16);
      const navigation = document.querySelector<HTMLElement>("[data-mobile-navigation]");
      const viewerHeight = navigation
        ? navigation.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 8
        : viewport.clientHeight;
      const visibleHeight = viewerHeight - 16;
      const availableHeight = Math.max(
        1,
        Math.min(viewport.clientHeight - 16, visibleHeight),
      );
      const firstPage = canvas.querySelector<HTMLElement>("[data-paper-page]");
      const pageHeight = Math.max(
        profile.heightIn * CSS_PIXELS_PER_INCH,
        firstPage?.scrollHeight ?? 0,
      );
      const fitHeight = mobileViewer && mobileView === "fit";
      const scale =
        mobileViewer && mobileView === "actual"
          ? 1
          : Math.min(
              1,
              availableWidth / naturalWidth,
              fitHeight ? availableHeight / pageHeight : 1,
            );
      const nextGeometry = {
        scale,
        width: naturalWidth,
        height: naturalHeight,
        viewportHeight: Math.max(1, viewerHeight),
      };
      setGeometry((current) =>
        current.scale === nextGeometry.scale
        && current.width === nextGeometry.width
        && current.height === nextGeometry.height
        && current.viewportHeight === nextGeometry.viewportHeight
          ? current
          : nextGeometry,
      );
    };

    const frame = window.requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(canvas);
    window.addEventListener("orientationchange", measure);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("orientationchange", measure);
      window.removeEventListener("resize", measure);
    };
  }, [fitOnMobile, mobileView, mobileViewer, profile.heightIn, profile.widthIn]);

  useEffect(() => {
    if (mobileView !== "actual" || geometry.scale !== 1) return;
    const pending = pendingFocusRef.current;
    const viewport = viewportRef.current;
    if (!pending || !viewport) return;

    let secondFrame: number | undefined;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        viewport.scrollLeft = Math.max(0, pending.naturalX - pending.localX);
        viewport.scrollTop = Math.max(0, pending.naturalY - pending.localY);
        pendingFocusRef.current = null;
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) window.cancelAnimationFrame(secondFrame);
    };
  }, [geometry.scale, mobileView]);

  function isInteractiveTarget(target: EventTarget | null) {
    return target instanceof Element
      && Boolean(target.closest("button, input, select, textarea, [role='button'], [contenteditable='true']"));
  }

  function setMobileZoom(
    next: MobilePaperView,
    clientX?: number,
    clientY?: number,
  ) {
    const viewport = viewportRef.current;
    const stage = stageRef.current;
    if (!mobileViewer || !viewport || !stage || next === mobileView) return;

    if (next === "fit") {
      pendingFocusRef.current = null;
      setMobileView("fit");
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          viewport.scrollLeft = 0;
          viewport.scrollTop = 0;
        });
      });
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const localX = clientX === undefined ? viewport.clientWidth / 2 : clientX - rect.left;
    const localY = clientY === undefined ? viewport.clientHeight / 2 : clientY - rect.top;
    pendingFocusRef.current = {
      naturalX: (viewport.scrollLeft + localX - stage.offsetLeft) / geometry.scale,
      naturalY: (viewport.scrollTop + localY - stage.offsetTop) / geometry.scale,
      localX,
      localY,
    };
    setMobileView("actual");
  }

  function toggleMobileZoom(clientX?: number, clientY?: number) {
    setMobileZoom(mobileView === "actual" ? "fit" : "actual", clientX, clientY);
  }

  function handleDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (isInteractiveTarget(event.target)) return;
    event.preventDefault();
    toggleMobileZoom(event.clientX, event.clientY);
  }

  function handleTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    if (!mobileViewer || isInteractiveTarget(event.target)) return;
    const touch = event.changedTouches[0];
    if (!touch) return;

    const now = Date.now();
    const last = lastTapRef.current;
    const distance = Math.hypot(touch.clientX - last.x, touch.clientY - last.y);
    if (now - last.at <= DOUBLE_TAP_DELAY_MS && distance <= DOUBLE_TAP_DISTANCE_PX) {
      event.preventDefault();
      lastTapRef.current = { at: 0, x: 0, y: 0 };
      toggleMobileZoom(touch.clientX, touch.clientY);
      return;
    }
    lastTapRef.current = { at: now, x: touch.clientX, y: touch.clientY };
  }

  const sheetKitStyle = {
    "--sheetkit-scale": geometry.scale,
    "--sheetkit-paper-width": `${geometry.width}px`,
    "--sheetkit-stage-width": `${geometry.width * geometry.scale}px`,
    "--sheetkit-stage-height": `${geometry.height * geometry.scale}px`,
    "--sheetkit-viewport-height": `${geometry.viewportHeight}px`,
    ...style,
  } as CSSProperties;

  return (
    <div
      className={styles.shell}
      data-mobile-viewer={mobileViewer ? "true" : "false"}
    >
      <div
        ref={viewportRef}
        className={`sheet-scroll ${styles.viewport}${className ? ` ${className}` : ""}`}
        data-paper-viewport=""
        data-paper-profile={profile.id}
        data-fit-mobile={fitOnMobile ? "true" : "false"}
        data-mobile-viewer={mobileViewer ? "true" : "false"}
        data-mobile-view={mobileView}
        aria-label={label}
        style={sheetKitStyle}
        onDoubleClick={mobileViewer ? handleDoubleClick : undefined}
        onTouchEnd={mobileViewer ? handleTouchEnd : undefined}
      >
        <div ref={stageRef} className={styles.stage}>
          <div ref={canvasRef} className={styles.canvas}>
            {children}
          </div>
        </div>
      </div>
      {mobileViewer && (
        <AriaButton
          className={`${styles.zoom} no-print`}
          aria-label={mobileView === "actual" ? "Fit whole sheet" : "View sheet at 100%"}
          onPress={() => toggleMobileZoom()}
        >
          {mobileView === "actual" ? (
            <Minimize2 aria-hidden="true" />
          ) : (
            <Maximize2 aria-hidden="true" />
          )}
          <span>{mobileView === "actual" ? "Fit" : "100%"}</span>
        </AriaButton>
      )}
    </div>
  );
}
