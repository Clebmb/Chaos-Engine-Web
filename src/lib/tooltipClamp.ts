/**
 * Global tooltip clamp — keeps every `?` info bubble on the page.
 *
 * Tooltips are fixed-width bubbles centered on their anchor icon, so any
 * icon near a viewport edge (oracle bar's Moon/Hour on narrow windows or
 * mobile, sidebar edge items) pushes its bubble off-page. Rather than
 * hardcoding per-tooltip alignment hacks, one delegated listener measures
 * whichever bubble is being hovered and shifts it back inside the viewport
 * with a margin. Works for every tooltip, including ones added later.
 *
 * The shift is applied as margin-left on the bubble: for the centered
 * `left: 50% + translateX(-50%)` positioning, margin shifts the final box
 * without touching the shared CSS. Measuring works even while the bubble
 * is still `visibility: hidden` (opacity transition hasn't run yet), so
 * the clamp lands before the fade-in.
 */

const EDGE_MARGIN = 8;

export function installTooltipClamp(): () => void {
  const handle = (e: MouseEvent) => {
    const target = e.target as Element | null;
    const box = target?.closest?.('.info-box-container');
    if (!box) return;
    const tip = box.querySelector('.info-tooltip') as HTMLElement | null;
    if (!tip) return;

    // Measure from a clean state so re-hovers recompute correctly.
    tip.style.marginLeft = '0px';
    const r = tip.getBoundingClientRect();
    let shift = 0;
    if (r.left < EDGE_MARGIN) {
      shift = EDGE_MARGIN - r.left; // bubble hangs off the left — push right
    } else if (r.right > window.innerWidth - EDGE_MARGIN) {
      shift = window.innerWidth - EDGE_MARGIN - r.right; // hang off the right — pull left
    }
    if (shift !== 0) {
      tip.style.marginLeft = `${shift}px`;
    }
  };

  document.addEventListener('mouseover', handle, true);
  return () => document.removeEventListener('mouseover', handle, true);
}
