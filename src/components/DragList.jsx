// Shared drag-to-reorder list (touch + mouse). Drag the ≡ handle; the new order is saved on drop.
// Auto-scrolls when you drag near the top or bottom of the screen.
import { useEffect, useRef, useState } from 'react';
import { db } from '../db';
import { cls } from '../utils';

export default function DragList({ items, renderItem, onReorder, className }) {
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null); // latest drag state for the scroll loop
  const rects = useRef([]);
  const gap = useRef(8);
  const listRef = useRef(null);
  const lastY = useRef(0);
  const raf = useRef(0);

  const update = (d) => {
    dragRef.current = d;
    setDrag(d);
  };

  function overIndex(d, clientY) {
    const dy = clientY - d.startY + (window.scrollY - d.startScroll);
    const r = rects.current[d.index];
    const center = r.top + r.height / 2 + dy;
    let over = 0;
    rects.current.forEach((rc, i) => {
      if (i !== d.index && rc.top + rc.height / 2 < center) over++;
    });
    return { dy, over };
  }

  function start(e, index) {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const kids = [...listRef.current.children];
    rects.current = kids.map((el) => el.getBoundingClientRect());
    gap.current = parseFloat(getComputedStyle(listRef.current).rowGap) || 8;
    lastY.current = e.clientY;
    update({ index, over: index, dy: 0, startY: e.clientY, startScroll: window.scrollY });
    navigator.vibrate?.(15);
    // Edge auto-scroll loop.
    const loop = () => {
      const d = dragRef.current;
      if (!d) return;
      const y = lastY.current;
      const speed = y < 90 ? -14 : y > window.innerHeight - 150 ? 14 : 0;
      if (speed) {
        window.scrollBy(0, speed);
        update({ ...d, ...overIndex(d, y) });
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  }

  function move(e) {
    const d = dragRef.current;
    if (!d) return;
    lastY.current = e.clientY;
    update({ ...d, ...overIndex(d, e.clientY) });
  }

  function end() {
    const d = dragRef.current;
    cancelAnimationFrame(raf.current);
    update(null);
    if (!d || d.index === d.over) return;
    const next = [...items];
    const [moved] = next.splice(d.index, 1);
    next.splice(d.over, 0, moved);
    onReorder(next);
  }

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const shiftFor = (i) => {
    if (!drag || i === drag.index) return 0;
    const h = rects.current[drag.index] ? rects.current[drag.index].height + gap.current : 0;
    if (drag.index < drag.over && i > drag.index && i <= drag.over) return -h;
    if (drag.index > drag.over && i < drag.index && i >= drag.over) return h;
    return 0;
  };

  return (
    <div className={cls('list drag-list', className)} ref={listRef}>
      {items.map((item, i) =>
        renderItem(item, i, {
          dragging: !!drag && drag.index === i,
          style: {
            transform: `translateY(${drag && drag.index === i ? drag.dy : shiftFor(i)}px)`,
            transition: drag && drag.index === i ? 'none' : 'transform 0.15s',
            position: 'relative',
            zIndex: drag && drag.index === i ? 5 : undefined,
          },
          handle: (
            <span
              className="drag-handle"
              role="button"
              aria-label={`Drag to reorder. Position ${i + 1}`}
              onPointerDown={(e) => start(e, i)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            >
              <span className="drag-rank">{i + 1}</span>≡
            </span>
          ),
        }),
      )}
    </div>
  );
}

// Manual order first (records you dragged), then the module's smart sort for the rest.
export const manualSort = (fallback) => (a, b) => {
  const d = (a.order ?? Infinity) - (b.order ?? Infinity);
  if (d) return d;
  return fallback ? fallback(a, b) : 0;
};

// Save a reordered (possibly filtered) list. Items hidden by the current filter keep
// their place; the visible items take the visible slots in their new order.
// Order changes don't touch updatedAt, so "stale" and "missed alarm" rules aren't affected.
export async function saveOrder(collection, allRecords, newVisible, fallbackSort) {
  const full = [...allRecords].sort(manualSort(fallbackSort));
  const visibleIds = new Set(newVisible.map((r) => r.id));
  let k = 0;
  const merged = full.map((r) => (visibleIds.has(r.id) ? newVisible[k++] : r));
  const table = db.table(collection);
  await db.transaction('rw', table, async () => {
    for (let i = 0; i < merged.length; i++) {
      if (merged[i].order !== i) await table.update(merged[i].id, { order: i });
    }
  });
}
