// Smooth scroll. Built by tools/build.mjs into website/assets/js/scroll.js.
import Lenis from "lenis";

export default function startScroll() {
  return new Lenis({
    autoRaf: true,
    lerp: 0.085,
    wheelMultiplier: 0.95,
    smoothWheel: true,
    anchors: { offset: -88 },
  });
}
