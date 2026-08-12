import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";

interface HorizontalScrollNavProps {
  children: ReactNode;
  /** Classes on the outer relative wrapper */
  className?: string;
  /** Classes on the scrollable flex row (defaults include flex-nowrap) */
  contentClassName?: string;
  /** CSS selector for the active tab/item inside the scroller */
  activeSelector?: string;
  /** Extra style on the scrollable element */
  style?: CSSProperties;
}

/**
 * Horizontal tab/nav scroller for the admin panel.
 * - Visible scrollbar
 * - Drag to scroll (mouse)
 * - Shift + mouse wheel
 * - Touch swipe (native)
 * - No wrap
 * - Keeps active item in view
 * - Side fades when content overflows
 */
export function HorizontalScrollNav({
  children,
  className = "",
  contentClassName = "",
  activeSelector = '[data-nav-active="true"]',
  style,
}: HorizontalScrollNavProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    scrollLeft: number;
    moved: boolean;
  }>({ active: false, startX: 0, scrollLeft: 0, moved: false });

  const [fadeLeft, setFadeLeft] = useState(false);
  const [fadeRight, setFadeRight] = useState(false);
  const [dragging, setDragging] = useState(false);

  const updateFades = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft;
    setFadeLeft(left > 4);
    setFadeRight(max > 4 && left < max - 4);
  }, []);

  const scrollActiveIntoView = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const active = el.querySelector(activeSelector) as HTMLElement | null;
    if (!active) return;
    const elRect = el.getBoundingClientRect();
    const aRect = active.getBoundingClientRect();
    const pad = 16;
    if (aRect.left < elRect.left + pad) {
      el.scrollBy({ left: aRect.left - elRect.left - pad, behavior: "smooth" });
    } else if (aRect.right > elRect.right - pad) {
      el.scrollBy({ left: aRect.right - elRect.right + pad, behavior: "smooth" });
    }
  }, [activeSelector]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateFades();
    scrollActiveIntoView();

    const onScroll = () => updateFades();
    el.addEventListener("scroll", onScroll, { passive: true });

    const onWheelNative = (e: WheelEvent) => {
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const delta = e.shiftKey ? e.deltaY : e.deltaX;
        if (delta === 0) return;
        e.preventDefault();
        el.scrollLeft += delta;
        updateFades();
      }
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
      updateFades();
      scrollActiveIntoView();
    }) : null;
    ro?.observe(el);

    const onWin = () => {
      updateFades();
      scrollActiveIntoView();
    };
    window.addEventListener("resize", onWin);

    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheelNative);
      ro?.disconnect();
      window.removeEventListener("resize", onWin);
    };
  }, [updateFades, scrollActiveIntoView, children]);

  useEffect(() => {
    // Re-center when active item changes (children re-render)
    const t = window.setTimeout(scrollActiveIntoView, 50);
    return () => window.clearTimeout(t);
  }, [children, scrollActiveIntoView]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only primary mouse button / touch / pen — let buttons/links still work on click
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    dragRef.current = {
      active: true,
      startX: e.clientX,
      scrollLeft: el.scrollLeft,
      moved: false,
    };
    setDragging(true);
    el.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.active) return;
    const el = scrollerRef.current;
    if (!el) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 4) d.moved = true;
    el.scrollLeft = d.scrollLeft - dx;
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.active) return;
    d.active = false;
    setDragging(false);
    const el = scrollerRef.current;
    el?.releasePointerCapture?.(e.pointerId);
  };

  const onClickCapture = (e: React.MouseEvent) => {
    // Prevent accidental click after a drag
    if (dragRef.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current.moved = false;
    }
  };

  return (
    <div className={`relative ${className}`.trim()}>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-0 w-8 z-10 transition-opacity duration-200 bg-gradient-to-r from-zinc-950 to-transparent ${
          fadeLeft ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-0 w-8 z-10 transition-opacity duration-200 bg-gradient-to-l from-zinc-950 to-transparent ${
          fadeRight ? "opacity-100" : "opacity-0"
        }`}
      />

      <div
        ref={scrollerRef}
        role="navigation"
        data-admin-h-scroll="true"
        className={`admin-h-scroll flex flex-nowrap overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x select-none ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        } ${contentClassName}`.trim()}
        style={style}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  );
}
