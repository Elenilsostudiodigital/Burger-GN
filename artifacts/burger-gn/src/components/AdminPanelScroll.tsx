import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const SCROLL_STEP = 220;

function isHorizontallyScrollable(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  const ox = style.overflowX;
  if (ox !== 'auto' && ox !== 'scroll' && ox !== 'overlay') return false;
  return el.scrollWidth > el.clientWidth + 2;
}

function collectScrollables(root: ParentNode): HTMLElement[] {
  const out: HTMLElement[] = [];
  const all = root.querySelectorAll('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (isHorizontallyScrollable(el)) out.push(el);
  }
  if (isHorizontallyScrollable(document.documentElement)) {
    out.push(document.documentElement);
  } else if (document.body && isHorizontallyScrollable(document.body)) {
    out.push(document.body);
  }
  return out;
}

function pickPrimary(scrollables: HTMLElement[]): HTMLElement | null {
  if (!scrollables.length) return null;
  // Prefer visible, widest overflow (typical: board / bottom nav / chip rows).
  let best: HTMLElement | null = null;
  let bestOverflow = 0;
  for (const el of scrollables) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) continue;
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    const overflow = el.scrollWidth - el.clientWidth;
    if (overflow > bestOverflow) {
      bestOverflow = overflow;
      best = el;
    }
  }
  return best || scrollables[0] || null;
}

function findScrollableFromEventTarget(target: EventTarget | null): HTMLElement | null {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.documentElement) {
    if (isHorizontallyScrollable(node)) return node;
    node = node.parentElement;
  }
  if (isHorizontallyScrollable(document.documentElement)) return document.documentElement;
  if (document.body && isHorizontallyScrollable(document.body)) return document.body;
  return null;
}

/**
 * Admin-only horizontal navigation assist.
 * Does not change page layouts or protected module logic — enables overflow-x
 * scrollbars, Shift+wheel / trackpad, and optional ← → when overflow exists.
 */
export function AdminPanelScroll() {
  const [needed, setNeeded] = useState(false);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const primaryRef = React.useRef<HTMLElement | null>(null);

  useEffect(() => {
    document.documentElement.classList.add('admin-panel');
    return () => {
      document.documentElement.classList.remove('admin-panel');
    };
  }, []);

  useEffect(() => {
    let raf = 0;

    const sync = () => {
      const list = collectScrollables(document);
      const primary = pickPrimary(list);
      primaryRef.current = primary;
      if (!primary) {
        setNeeded(false);
        setCanLeft(false);
        setCanRight(false);
        return;
      }
      const max = primary.scrollWidth - primary.clientWidth;
      setNeeded(max > 2);
      setCanLeft(primary.scrollLeft > 2);
      setCanRight(primary.scrollLeft < max - 2);
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    };

    schedule();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);

    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true });

    const onWheel = (e: WheelEvent) => {
      // Natural trackpad horizontal already updates overflow-x targets.
      if (!e.shiftKey) return;
      if (Math.abs(e.deltaY) < 1) return;
      const el = findScrollableFromEventTarget(e.target) || primaryRef.current;
      if (!el) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 2) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
      schedule();
    };

    window.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('wheel', onWheel);
      mo.disconnect();
    };
  }, []);

  const scrollBy = (dir: -1 | 1) => {
    const el = primaryRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * SCROLL_STEP, behavior: 'smooth' });
  };

  if (!needed) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Rolar para a esquerda"
        disabled={!canLeft}
        onClick={() => scrollBy(-1)}
        className="fixed left-1 top-1/2 z-[70] -translate-y-1/2 h-9 w-9 rounded-full border border-zinc-700 bg-zinc-950/80 text-zinc-200 disabled:opacity-30"
      >
        <ChevronLeft size={18} className="mx-auto" />
      </button>
      <button
        type="button"
        aria-label="Rolar para a direita"
        disabled={!canRight}
        onClick={() => scrollBy(1)}
        className="fixed right-1 top-1/2 z-[70] -translate-y-1/2 h-9 w-9 rounded-full border border-zinc-700 bg-zinc-950/80 text-zinc-200 disabled:opacity-30"
      >
        <ChevronRight size={18} className="mx-auto" />
      </button>
    </>
  );
}
