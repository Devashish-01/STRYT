import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  STORY_SLIDE_MS, neighbourGroupPointer, nextPointer, prevPointer,
  type StoryGroup, type StoryPointer,
} from "@/lib/stories";

/** Press longer than this and it is a "hold" (pauses the story), not a tap. */
const HOLD_MS = 180;
/** Finger travel below this still counts as a tap / a steady hold. */
const SLOP_PX = 10;
const SWIPE_SIDE_PX = 56;
const SWIPE_DOWN_PX = 96;
/** Left third of the screen goes back, the rest goes forward — Instagram's split. */
const BACK_ZONE = 0.33;

/** Keeps a pointer inside the groups after a story was deleted or a person dropped out. */
function clampPointer(groups: readonly { stories: readonly unknown[] }[], p: StoryPointer): StoryPointer {
  if (groups.length === 0) return { group: 0, story: 0 };
  const group = Math.min(Math.max(0, p.group), groups.length - 1);
  const story = Math.min(Math.max(0, p.story), Math.max(0, groups[group].stories.length - 1));
  return { group, story };
}

export interface StoryPlayerArgs {
  groups: StoryGroup[];
  start: StoryPointer;
  onClose: () => void;
  /** Something else wants the story to wait: a sheet, the reply box, the report dialog. */
  paused: boolean;
}

/**
 * The viewer's clock and gestures, kept out of the component so the component only draws.
 *
 *  - progress is written straight to the bar elements (`registerFill`) — re-rendering the whole viewer
 *    sixty times a second for a 3-pixel bar is what made the old one janky;
 *  - hold = pause (and the chrome hides), tap = back/forward, swipe down = close, swipe sideways = next/previous person;
 *  - the clock also stops when the app goes to the background.
 */
export function useStoryPlayer({ groups, start, onClose, paused }: StoryPlayerArgs) {
  const [rawPointer, setPointer] = useState<StoryPointer>(start);
  const pointer = useMemo(() => clampPointer(groups, rawPointer), [groups, rawPointer]);
  const [held, setHeld] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [hidden, setHidden] = useState(typeof document !== "undefined" && document.hidden);

  const groupsRef = useRef(groups);
  const pointerRef = useRef(pointer);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => { groupsRef.current = groups; pointerRef.current = pointer; onCloseRef.current = onClose; });

  const group = groups[pointer.group];
  const story = group?.stories[pointer.story];
  const storyId = story?.id;

  // The clock does not run until the photo is on screen (or has failed — then the gradient is). A story with no
  // photo at all is ready at once.
  const [readyId, setReadyId] = useState<string | null>(null);
  const ready = !!story && (!story.image || readyId === story.id);
  const markReady = useCallback((id: string) => setReadyId(id), []);

  // ── progress bars ───────────────────────────────────────
  const fills = useRef<(HTMLElement | null)[]>([]);
  const registerFill = useCallback((i: number, el: HTMLElement | null) => { fills.current[i] = el; }, []);
  const elapsed = useRef(0);

  const paint = useCallback((p: number) => {
    const cur = pointerRef.current.story;
    fills.current.forEach((el, i) => {
      if (!el) return;
      el.style.transform = `scaleX(${i < cur ? 1 : i === cur ? p : 0})`;
    });
  }, []);

  // A new story starts from zero. Layout effect: no frame where the old bar is full and the new one is not.
  useLayoutEffect(() => { elapsed.current = 0; paint(0); }, [storyId, pointer.group, pointer.story, paint]);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const go = useCallback((target: StoryPointer | "close") => {
    if (target === "close") onCloseRef.current();
    else setPointer(target);
  }, []);

  const goNext = useCallback(() => go(nextPointer(groupsRef.current, pointerRef.current)), [go]);
  const goPrev = useCallback(() => {
    const r = prevPointer(groupsRef.current, pointerRef.current);
    if (r === "restart") { elapsed.current = 0; paint(0); } else go(r);
  }, [go, paint]);
  const goNeighbour = useCallback((dir: 1 | -1) => {
    const r = neighbourGroupPointer(groupsRef.current, pointerRef.current, dir);
    // Past the first/last person: forward closes (like finishing the reel), backward just replays.
    if (r) go(r); else if (dir === 1) go("close"); else { elapsed.current = 0; paint(0); }
  }, [go, paint]);

  const running = ready && !paused && !held && !dragging && !hidden && !!story;

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsed.current += now - last;
      last = now;
      const p = Math.min(1, elapsed.current / STORY_SLIDE_MS);
      paint(p);
      if (p >= 1) { goNext(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, storyId, goNext, paint]);

  // ── gestures ────────────────────────────────────────────
  const press = useRef<{ x: number; y: number; t: number; moved: boolean; held: boolean; id: number } | null>(null);
  const holdTimer = useRef<number | null>(null);
  const clearHold = useCallback(() => { if (holdTimer.current != null) { window.clearTimeout(holdTimer.current); holdTimer.current = null; } }, []);
  useEffect(() => clearHold, [clearHold]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== undefined && e.button > 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    press.current = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, held: false, id: e.pointerId };
    clearHold();
    holdTimer.current = window.setTimeout(() => {
      if (press.current && !press.current.moved) { press.current.held = true; setHeld(true); }
    }, HOLD_MS);
  }, [clearHold]);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.moved && Math.hypot(dx, dy) > SLOP_PX) {
      p.moved = true;
      clearHold();
    }
    // A downward drag moves the whole story with the finger; anything else is judged on release.
    if (p.moved && dy > 0 && dy > Math.abs(dx)) { setDragging(true); setDragY(dy); }
  }, [clearHold]);

  const finish = useCallback((e: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    press.current = null;
    clearHold();
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    const wasHeld = p.held;
    setHeld(false);
    setDragging(false);
    setDragY(0);
    if (cancelled) return;

    if (dy > SWIPE_DOWN_PX && dy > Math.abs(dx)) { onCloseRef.current(); return; }
    if (Math.abs(dx) > SWIPE_SIDE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) { goNeighbour(dx < 0 ? 1 : -1); return; }
    if (wasHeld || p.moved) return; // let go of a hold, or a drag that did not go anywhere: stay put

    const rect = e.currentTarget.getBoundingClientRect();
    if ((e.clientX - rect.left) / rect.width < BACK_ZONE) goPrev();
    else goNext();
  }, [clearHold, goNext, goPrev, goNeighbour]);

  const stageHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => finish(e, false),
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => finish(e, true),
  };

  return {
    pointer, group, story, held, dragY, dragging,
    stageHandlers, registerFill, markReady, goNext, goPrev, goNeighbour, jump: setPointer,
  };
}
