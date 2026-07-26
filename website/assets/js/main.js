(() => {
  "use strict";

  const header = document.querySelector(".site-header");
  const navToggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");
  const landingPage = document.querySelector(".landing-page");
  let returnFocus = null;
  let viewportFrame = 0;

  const syncViewportHeight = () => {
    if (!landingPage) return;
    window.cancelAnimationFrame(viewportFrame);
    viewportFrame = window.requestAnimationFrame(() => {
      document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
    });
  };

  const syncHeader = () => {
    header?.classList.toggle("is-scrolled", window.scrollY > 16);
  };

  const setMenuState = (open, { restoreFocus = false } = {}) => {
    if (!header || !navToggle) return;
    header.classList.toggle("is-open", open);
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");

    if (open) {
      returnFocus = document.activeElement;
      const firstLink = nav?.querySelector("a");
      window.requestAnimationFrame(() => firstLink?.focus());
    } else if (restoreFocus) {
      (returnFocus instanceof HTMLElement ? returnFocus : navToggle).focus();
    }
  };

  syncHeader();
  syncViewportHeight();
  window.addEventListener("scroll", syncHeader, { passive: true });
  window.addEventListener("resize", syncViewportHeight, { passive: true });
  window.addEventListener("orientationchange", syncViewportHeight, { passive: true });

  navToggle?.addEventListener("click", () => {
    const open = !header?.classList.contains("is-open");
    setMenuState(open);
  });

  nav?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setMenuState(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && header?.classList.contains("is-open")) {
      setMenuState(false, { restoreFocus: true });
      return;
    }

    if (event.key !== "Tab" || !header?.classList.contains("is-open") || !navToggle || !nav) return;
    const focusable = [navToggle, ...nav.querySelectorAll("a, button, select")].filter(
      (element) => element instanceof HTMLElement && !element.hidden,
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  document.addEventListener("click", (event) => {
    if (!header?.classList.contains("is-open")) return;
    if (event.target instanceof Node && !header.contains(event.target)) {
      setMenuState(false);
    }
  });

  const productVideo = document.querySelector("[data-product-video]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const dataSaverEnabled = Boolean(navigator.connection?.saveData);
  let resumeAfterVisibility = false;

  const startAmbientVideo = () => {
    if (!(productVideo instanceof HTMLVideoElement)) return;
    if (reducedMotion.matches || dataSaverEnabled) {
      productVideo.pause();
      return;
    }
    productVideo.play().catch(() => {
      // The poster remains visible if a browser blocks muted autoplay.
    });
  };

  if (productVideo instanceof HTMLVideoElement) {
    startAmbientVideo();

    reducedMotion.addEventListener?.("change", () => {
      if (reducedMotion.matches) productVideo.pause();
      else startAmbientVideo();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        resumeAfterVisibility = !productVideo.paused;
        productVideo.pause();
      } else if (resumeAfterVisibility && !reducedMotion.matches && !dataSaverEnabled) {
        resumeAfterVisibility = false;
        productVideo.play().catch(() => {
          // The poster remains visible if a browser blocks muted autoplay.
        });
      }
    });
  }

  const gallery = document.querySelector("[data-gallery]");
  document.querySelectorAll("[data-gallery-direction]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!gallery) return;
      const direction = button.dataset.galleryDirection === "next" ? 1 : -1;
      const card = gallery.querySelector(".gallery-card");
      const gap = Number.parseFloat(getComputedStyle(gallery).columnGap || "0");
      gallery.scrollBy({
        left: direction * ((card?.getBoundingClientRect().width ?? 320) + gap),
        behavior: "smooth",
      });
    });
  });

  const tocLinks = [...document.querySelectorAll(".toc a[href^='#']")];
  const sections = tocLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length > 0) {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        tocLinks.forEach((link) => {
          link.classList.toggle(
            "is-active",
            link.getAttribute("href") === `#${visible.target.id}`,
          );
        });
      },
      { rootMargin: "-20% 0px -65%", threshold: [0, 0.25, 0.75] },
    );
    sections.forEach((section) => observer.observe(section));
  }

  document.querySelectorAll("[data-current-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });
})();
