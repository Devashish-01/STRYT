import { useRef } from "react";

/**
 * 450ms hold (touch or mouse) or right-click triggers onLongPress; a normal
 * tap/click should still fire its own handler — wrap it with wrapTap() so
 * the click that follows a long-press release doesn't also fire as a tap.
 * Extracted from BottomNav.tsx's original hand-rolled Profile-tab timer once
 * RoleSwitcher needed the same behavior on the manage-console header pill.
 */
export function useLongPress(onLongPress: () => void, delay = 450) {
  const pressTimer = useRef<number | undefined>(undefined);
  const wasLongPress = useRef(false);

  function start() {
    wasLongPress.current = false;
    pressTimer.current = window.setTimeout(() => {
      wasLongPress.current = true;
      onLongPress();
    }, delay);
  }

  function end() {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
  }

  function wrapTap<T extends (...args: any[]) => void>(onTap: T) {
    return (...args: Parameters<T>) => {
      if (wasLongPress.current) {
        wasLongPress.current = false;
        return;
      }
      onTap(...args);
    };
  }

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    onLongPress();
  }

  return {
    handlers: {
      onTouchStart: start,
      onTouchEnd: end,
      onMouseDown: start,
      onMouseUp: end,
      onMouseLeave: end,
      onContextMenu,
    },
    wrapTap,
  };
}
