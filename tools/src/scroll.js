// Smooth scroll. Built by tools/build.mjs into website/assets/js/scroll.js.
import Lenis from "lenis";

export default function startScroll() {
  return new Lenis({
    autoRaf: true,
    lerp: 0.085,
    wheelMultiplier: 0.95,
    smoothWheel: true,
    // Section links: Lenis already keeps the html scroll-padding-top (styles.css) free for the header.
    anchors: true,
  });
}
