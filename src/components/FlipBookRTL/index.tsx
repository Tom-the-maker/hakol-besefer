"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { useImagePreload } from "@/lib/useImagePreload";
import "./FlipBook.css";

export type Spread = {
  imageUrl: string;
  text: string;
};

export type FlipBookRTLProps = {
  width: number;
  height: number;
  coverFront: { imageUrl: string };
  coverBack: { imageUrl?: string; backText?: string };
  spreads: Spread[];
  startClosed?: boolean;
  onOpen?: () => void;
  onClose?: (side: "front" | "back") => void;
  className?: string;
};

type State =
  | { kind: "closedFront" }
  | { kind: "open"; i: number } // i is 0-based spread index
  | { kind: "closedBack" };

const ease = "cubic-bezier(.25,.8,.25,1)";
const FLIP_MS = 520; // duration per spec

export const FlipBookRTL: React.FC<FlipBookRTLProps> = ({
  width,
  height,
  coverFront,
  coverBack,
  spreads,
  startClosed = true,
  onOpen,
  onClose,
  className,
}) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const [state, setState] = useState<State>(
    startClosed ? { kind: "closedFront" } : { kind: "open", i: 0 }
  );
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [anim, setAnim] = useState<"idle" | "turnLeft" | "turnRight">("idle");
  const [hover, setHover] = useState<"left" | "right" | null>(null);
  const [hoverProg, setHoverProg] = useState(0);
  const [reduced, setReduced] = useState(false);
  const animRef = useRef<number | null>(null);

  // Preload images (covers + spreads)
  useImagePreload(
    [coverFront.imageUrl, coverBack.imageUrl, ...spreads.map((s) => s.imageUrl)].filter(
      Boolean
    ) as string[]
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(!!mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  const isOpen = state.kind === "open";
  const spreadIndex = state.kind === "open" ? state.i : 0;

  // Helpers for next/prev
  const canPrev = isOpen; // when open, right page is clickable to go back
  const canNext = isOpen; // when open, left page is clickable to go forward

  const openFromCover = useCallback(() => {
    if (state.kind !== "closedFront") return;
    setAnim("turnRight");
    setTimeout(() => {
      setAnim("idle");
      setState({ kind: "open", i: 0 });
      onOpen?.();
    }, reduced ? 0 : FLIP_MS);
  }, [state, onOpen]);

  const closeToFront = useCallback(() => {
    setAnim("turnLeft");
    setTimeout(() => {
      setAnim("idle");
      setState({ kind: "closedFront" });
      onClose?.("front");
    }, reduced ? 0 : FLIP_MS);
  }, [onClose]);

  const closeToBack = useCallback(() => {
    setAnim("turnRight");
    setTimeout(() => {
      setAnim("idle");
      setState({ kind: "closedBack" });
      onClose?.("back");
    }, reduced ? 0 : FLIP_MS);
  }, [onClose]);

  // From back cover, flip back to front cover on click
  const flipBackCoverToFront = useCallback(() => {
    setAnim("turnLeft");
    setTimeout(() => {
      setAnim("idle");
      setState({ kind: "closedFront" });
      onClose?.("front");
    }, reduced ? 0 : FLIP_MS);
  }, [onClose, reduced]);

  const goNext = useCallback(() => {
    if (!isOpen) return;
    if (spreadIndex === spreads.length - 1) {
      // turn to back cover
      closeToBack();
      return;
    }
    setAnim("turnRight");
    setTimeout(() => {
      setAnim("idle");
      setState({ kind: "open", i: spreadIndex + 1 });
    }, reduced ? 0 : FLIP_MS);
  }, [isOpen, spreadIndex, spreads.length, closeToBack]);

  const goPrev = useCallback(() => {
    if (!isOpen) return;
    if (spreadIndex === 0) {
      // close to front cover
      closeToFront();
      return;
    }
    setAnim("turnLeft");
    setTimeout(() => {
      setAnim("idle");
      setState({ kind: "open", i: spreadIndex - 1 });
    }, reduced ? 0 : FLIP_MS);
  }, [isOpen, spreadIndex, closeToFront]);

  // Right page = back: step to previous spread; if first, close to front
  // (Handled by goPrev)

  // Hover interactions: create a live corner curl based on pointer X
  const onMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isOpen) return;
      const el = stageRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const mid = r.left + r.width / 2;
      const x = e.clientX;
      if (x < mid) {
        const p = Math.min(1, Math.max(0, 1 - (x - r.left) / (r.width / 2)));
        setHover("left");
        setHoverProg(p);
      } else {
        const p = Math.min(1, Math.max(0, (x - mid) / (r.width / 2)));
        setHover("right");
        setHoverProg(p);
      }
    },
    [isOpen]
  );

  const onLeave = useCallback(() => {
    setHover(null);
    setHoverProg(0);
  }, []);

  // Keyboard (RTL logic): ArrowLeft = previous (click right page), ArrowRight = next (click left page)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        goPrev();
      } else if (e.key === "ArrowRight") {
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext]);

  // Touch swipe (RTL): swipe-right => next, swipe-left => prev
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let startX = 0;
    let moved = false;
    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      moved = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      const dx = e.touches[0].clientX - startX;
      moved = Math.abs(dx) > 10;
      // preview curl
      if (!isOpen) return;
      const r = el.getBoundingClientRect();
      if (dx > 0) {
        // swipe right (next in RTL)
        const p = Math.min(1, Math.max(0, dx / (r.width / 2)));
        setHover("left");
        setHoverProg(p);
      } else if (dx < 0) {
        const p = Math.min(1, Math.max(0, -dx / (r.width / 2)));
        setHover("right");
        setHoverProg(p);
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!moved) {
        setHover(null); setHoverProg(0);
        return;
      }
      const dx = e.changedTouches[0].clientX - startX;
      setHover(null); setHoverProg(0);
      if (dx > 30) goNext();
      else if (dx < -30) goPrev();
    };
    el.addEventListener("touchstart", onTouchStart);
    el.addEventListener("touchmove", onTouchMove);
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [goNext, goPrev, isOpen]);

  // Render helpers
  const renderRightText = (text: string) => {
    const textAlign = isRTL ? "right" : "left";
    const dir = isRTL ? "rtl" : "ltr";
    return (
      <div
        dir={dir}
        style={{
          width: "100%",
          height: "100%",
          padding: "28px",
          overflow: "auto",
          textAlign: textAlign as any,
          direction: dir as any,
          lineHeight: 1.6,
          color: "#1A1A1A",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          alignItems: isRTL ? "flex-end" : "flex-start",
        }}
      >
        <div style={{ textAlign: textAlign as any, direction: dir as any, width: "100%" }}>
          {text}
        </div>
      </div>
    );
  };

  return (
    <div className={clsx("flipbook-rtl-root", className)} role="region" aria-label="Flipbook RTL">
      {/* stage */}
      <div
        ref={stageRef}
        className="flipbook-stage"
        style={{ width: isOpen ? width * 2 : width, height }}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        <div className="flipbook-rtl" style={{ width: "100%", height: "100%", ['--flip-ms' as any]: reduced ? '0ms' : `${FLIP_MS}ms` }}>
          {state.kind === "closedFront" && (
            <button
              aria-label={isRTL ? "פתחו את הספר" : "Open book"}
              onClick={openFromCover}
              style={{
                width,
                height,
                background: `url(${coverFront.imageUrl}) center/cover no-repeat`,
                borderRadius: 12,
                boxShadow: "0 16px 50px rgba(0,0,0,.16)",
                border: 0,
                cursor: "pointer",
              }}
            />
          )}

          {state.kind === "closedBack" && (
            <button
              aria-label={isRTL ? "חזרה לכריכה הקדמית" : "Back to front cover"}
              onClick={flipBackCoverToFront}
              style={{
                width,
                height,
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 16px 50px rgba(0,0,0,.16)",
                position: "relative",
                background: coverBack.imageUrl
                  ? `url(${coverBack.imageUrl}) center/cover no-repeat`
                  : "#8B572A",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                border: 0,
                cursor: "pointer",
                textAlign: isRTL ? "right" : "left",
                direction: isRTL ? "rtl" : "ltr",
              }}
            >
              {!coverBack.imageUrl && (coverBack.backText || (isRTL ? "הספר הזה יכול להיות שלך." : "This book can be yours."))}
            </button>
          )}

          {state.kind === "open" && (
            <div className="flipbook-spread" style={{ width: width * 2, height, borderRadius: 12, direction: isRTL ? 'rtl' : 'ltr' }}>
              {/* gutter shadow */}
              <div className="flipbook-gutter" />
              {/* Left page (TEXT) */}
              <button
                aria-label={isRTL ? "עמוד הבא" : "Next page"}
                className={clsx("flipbook-page flipbook-left")}
                style={{ width, height, cursor: "pointer", direction: isRTL ? 'rtl' : 'ltr' }}
                onClick={goNext}
              >
                {renderRightText(spreads[spreadIndex].text)}
                {/* page shadow */}
                <div
                  className="page-shadow left"
                  style={{
                    opacity: anim === "turnRight" ? 1 : hover === "left" ? Math.min(1, hoverProg * 0.6) : 0,
                    transition: `opacity ${FLIP_MS}ms ${ease}`,
                  }}
                />
                <div className="fold-hint-left" />
              </button>

              {/* Right page (IMAGE) */}
              <button
                aria-label={spreadIndex === 0 ? (isRTL ? "סגירת הספר" : "Close book") : (isRTL ? "עמוד קודם" : "Previous page")}
                className={clsx("flipbook-page flipbook-right")}
                style={{ width, height, cursor: "pointer" }}
                onClick={goPrev}
              >
                <img
                  src={spreads[spreadIndex].imageUrl}
                  alt={isRTL ? "איור הסיפור" : "Story illustration"}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                <div
                  className="page-shadow right"
                  style={{
                    opacity: anim === "turnLeft" ? 1 : hover === "right" ? Math.min(1, hoverProg * 0.6) : 0,
                    transition: `opacity ${FLIP_MS}ms ${ease}`,
                  }}
                />
                <div className="fold-hint-right" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FlipBookRTL;
