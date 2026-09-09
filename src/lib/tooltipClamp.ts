/**
 * Global tooltip placement — keeps every `?` info bubble fully on screen,
 * on mouse AND touch, with text that always fits inside the box.
 *
 * The bubbles are `position: fixed` and fully positioned by this module:
 * centered on their anchor icon, clamped inside the viewport with a margin,
 * and flipped below the icon when there is no room above (top-bar icons).
 * Width is shrink-to-fit capped to the viewport, so long tokens wrap inside
 * the bubble instead of spilling past its border.
 *
 * Activation paths:
 *  - mouseover/mouseout for desktop hover (capture phase, delegated).
 *  - touchstart tap-to-toggle for mobile: first tap shows, second tap on the
 *    same icon (or a tap anywhere else) hides. Without this, touch devices
 *    never ran any positioning code at all and top-bar bubbles overflowed.
 *  - capture-phase scroll/resize re-place or hide the active bubble, so
 *    scrolling a modal or the sidebar can never strand it off-screen.
 */

const EDGE = 8; // keep at least this many px of bubble inside the viewport
const GAP = 6; // px between the anchor icon and the bubble edge

export function installTooltipClamp(): () => void {
  let active: Element | null = null;

  const anchorOf = (box: Element): Element =>
    (box.querySelector('.info-icon, .warning-label') as Element | null) ?? box;

  /** Position `tip` relative to its anchor, fully inside the viewport. */
  const place = (tip: HTMLElement, anchor: Element): void => {
    // Measure from a clean state so re-activations recompute correctly.
    tip.style.left = '0px';
    tip.style.top = '0px';

    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const a = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (tw === 0 || th === 0) return; // not laid out (e.g. display:none theme)

    // Horizontal: prefer centered over the anchor, clamp to the viewport.
    let left = a.left + a.width / 2 - tw / 2;
    left = Math.min(Math.max(EDGE, left), Math.max(EDGE, vw - EDGE - tw));

    // Vertical: prefer above the anchor; flip below when clipped; clamp last.
    let top = a.top - GAP - th;
    if (top < EDGE) {
      const below = a.bottom + GAP;
      if (below + th <= vh - EDGE) top = below;
    }
    top = Math.max(EDGE, Math.min(top, vh - EDGE - th));

    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };

  const activate = (box: Element): void => {
    const tip = box.querySelector('.info-tooltip') as HTMLElement | null;
    if (!tip) return;
    place(tip, anchorOf(box));
    box.classList.add('show-tip');
    active = box;
  };

  const deactivate = (): void => {
    active?.classList.remove('show-tip');
    active = null;
  };

  const onMouseOver = (e: MouseEvent): void => {
    const box = (e.target as Element | null)?.closest?.('.info-box-container');
    if (!box) return;
    activate(box);
  };

  const onMouseOut = (e: MouseEvent): void => {
    const box = (e.target as Element | null)?.closest?.('.info-box-container');
    if (!box || !active) return;
    // Only hide when the pointer truly left the container (child hops fire
    // mouseout with relatedTarget still inside).
    if (!box.contains(e.relatedTarget as Node | null)) {
      if (box === active) deactivate();
      else box.classList.remove('show-tip');
    }
  };

  const onTouchStart = (e: TouchEvent): void => {
    const box = (e.target as Element | null)?.closest?.('.info-box-container');
    if (box && box === active) {
      deactivate(); // second tap on the same icon dismisses
      return;
    }
    deactivate(); // tapping anywhere else dismisses first
    if (box) activate(box); // first tap on an icon shows its bubble
  };

  const onScrollOrResize = (): void => {
    if (!active || !active.isConnected) {
      deactivate();
      return;
    }
    const tip = active.querySelector('.info-tooltip') as HTMLElement | null;
    if (tip) place(tip, anchorOf(active));
  };

  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', onMouseOut, true);
  document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);

  return () => {
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    document.removeEventListener('touchstart', onTouchStart, true);
    window.removeEventListener('scroll', onScrollOrResize, true);
    window.removeEventListener('resize', onScrollOrResize);
  };
}
