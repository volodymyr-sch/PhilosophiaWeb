(() => {
  "use strict";

  const selfScript = document.currentScript;
  const analyticsId = "G-JCXBSEW87K";
  const analyticsConsentKey = "philosophia-analytics-consent";
  const analyticsHosts = new Set(["philosophiaquotes.com", "www.philosophiaquotes.com"]);
  let analyticsConsent = null;
  let googleTagLoaded = false;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
  });
  window.gtag("set", "ads_data_redaction", true);

  const readAnalyticsConsent = () => {
    try {
      return window.localStorage.getItem(analyticsConsentKey);
    } catch {
      return null;
    }
  };

  const writeAnalyticsConsent = (value) => {
    try {
      window.localStorage.setItem(analyticsConsentKey, value);
    } catch {
      // Consent still applies for the current page when storage is unavailable.
    }
  };

  const clearAnalyticsCookies = () => {
    document.cookie.split(";").forEach((cookie) => {
      const name = cookie.split("=")[0]?.trim();
      if (!name || (name !== "_ga" && !name.startsWith("_ga_"))) return;
      const expiration = "expires=Thu, 01 Jan 1970 00:00:00 GMT";
      document.cookie = `${name}=;${expiration};path=/;SameSite=Lax`;
      document.cookie = `${name}=;${expiration};path=/;domain=.philosophiaquotes.com;SameSite=Lax`;
    });
  };

  const loadGoogleTag = () => {
    if (googleTagLoaded || !analyticsHosts.has(window.location.hostname)) return;
    googleTagLoaded = true;

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(analyticsId)}`;
    document.head.append(script);

    window.gtag("js", new Date());
    window.gtag("config", analyticsId, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
  };

  const updateAnalyticsConsent = (value) => {
    analyticsConsent = value;
    writeAnalyticsConsent(value);
    window.gtag("consent", "update", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: value === "granted" ? "granted" : "denied",
    });

    if (value === "granted") {
      loadGoogleTag();
    } else {
      clearAnalyticsCookies();
    }
  };

  const privacyPolicyUrl = new URL("../../privacy-policy.html", selfScript?.src || window.location.href).href;

  const removeConsentPrompt = () => {
    document.querySelector("[data-analytics-consent]")?.remove();
  };

  const showConsentPrompt = ({ focus = false } = {}) => {
    const existingPrompt = document.querySelector("[data-analytics-consent]");
    if (existingPrompt) {
      if (focus) existingPrompt.querySelector("[data-consent-allow]")?.focus();
      return;
    }

    const prompt = document.createElement("section");
    prompt.className = "analytics-consent";
    prompt.dataset.analyticsConsent = "";
    prompt.setAttribute("role", "dialog");
    prompt.setAttribute("aria-labelledby", "analytics-consent-title");
    prompt.innerHTML = `
      <div class="analytics-consent__copy">
        <p class="eyebrow">Your privacy</p>
        <h2 id="analytics-consent-title">Help us improve Philosophia.</h2>
        <p>With your permission, Google Analytics measures page visits and App Store or Google Play clicks. We do not use analytics for advertising. <a href="${privacyPolicyUrl}">Privacy policy</a></p>
      </div>
      <div class="analytics-consent__actions">
        <button class="button button-small" type="button" data-consent-allow>Allow analytics</button>
        <button class="button button-small button-secondary" type="button" data-consent-decline>Decline</button>
      </div>
    `;
    document.body.append(prompt);

    prompt.querySelector("[data-consent-allow]")?.addEventListener("click", () => {
      updateAnalyticsConsent("granted");
      removeConsentPrompt();
    });
    prompt.querySelector("[data-consent-decline]")?.addEventListener("click", () => {
      updateAnalyticsConsent("denied");
      removeConsentPrompt();
    });

    if (focus) prompt.querySelector("[data-consent-allow]")?.focus();
  };

  const addAnalyticsPreferenceControls = () => {
    document.querySelectorAll('a[href$="privacy-policy.html"]').forEach((privacyLink) => {
      if (privacyLink.closest("[data-analytics-consent]")) return;
      if (privacyLink.parentElement?.querySelector("[data-analytics-preferences]")) return;
      const control = document.createElement("button");
      control.className = "analytics-preferences";
      if (privacyLink.classList.contains("mobile-nav-link")) {
        control.classList.add("mobile-nav-link");
      }
      control.type = "button";
      control.dataset.analyticsPreferences = "";
      control.textContent = "Analytics settings";
      control.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        showConsentPrompt({ focus: true });
      });
      privacyLink.insertAdjacentElement("afterend", control);
    });
  };

  const getPageType = () => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts.length === 0 || parts[0] === "index.html") return "homepage";
    const section = parts[0];
    if (parts.length === 1 || parts[1] === "index.html") return `${section}_hub`;
    return section.endsWith("s") ? section.slice(0, -1) : section;
  };

  const trackStoreClick = (link) => {
    if (analyticsConsent !== "granted" || !analyticsHosts.has(window.location.hostname)) return;
    const destination = new URL(link.href);
    const storePlatform = destination.hostname.includes("apple.com") ? "ios" : "android";
    window.gtag("event", "store_click", {
      send_to: analyticsId,
      store_platform: storePlatform,
      cta_location: link.dataset.location || "unspecified",
      page_type: getPageType(),
      link_url: link.href,
      transport_type: "beacon",
    });
  };

  analyticsConsent = readAnalyticsConsent();
  if (analyticsConsent === "granted" || analyticsConsent === "denied") {
    updateAnalyticsConsent(analyticsConsent);
  } else {
    showConsentPrompt();
  }
  addAnalyticsPreferenceControls();

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;

    const preferenceControl = event.target.closest("[data-analytics-preferences]");
    if (preferenceControl instanceof HTMLButtonElement) {
      event.preventDefault();
      showConsentPrompt({ focus: true });
      return;
    }

    const link = event.target.closest("a[data-location]");
    if (!(link instanceof HTMLAnchorElement)) return;
    const hostname = new URL(link.href).hostname;
    if (hostname.includes("apple.com") || hostname.includes("play.google.com")) {
      trackStoreClick(link);
    }
  });

  const header = document.querySelector(".site-header");
  const navToggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");
  let returnFocus = null;

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
  window.addEventListener("scroll", syncHeader, { passive: true });

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

  // The active section is the last one whose heading is above 35% of the screen height.
  const tocLinks = [...document.querySelectorAll(".toc a[href^='#']")];
  const sections = tocLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  if (sections.length > 0) {
    const markActiveSection = () => {
      const line = window.innerHeight * 0.35;
      const current = sections.filter((section) => section.getBoundingClientRect().top <= line).pop() || sections[0];
      tocLinks.forEach((link) => {
        link.classList.toggle("is-active", link.getAttribute("href") === `#${current.id}`);
      });
    };
    markActiveSection();
    window.addEventListener("scroll", markActiveSection, { passive: true });
    window.addEventListener("resize", markActiveSection);
  }

  // ---- The header pill: after the page title scrolls away, it shows the page name ----
  // The name opens the list of sections, so readers always know where they are (styles.css).
  // Wide screens show the list in a panel left of the text instead, so it stays in its aside there.
  const toc = document.querySelector(".toc");
  const tocAside = toc?.parentElement;
  const pageTop = document.querySelector(".quote-hero, .guide-hero");
  const brand = header?.querySelector(".brand");
  if (header && toc && tocAside && pageTop && brand && "IntersectionObserver" in window) {
    const pill = document.createElement("button");
    const label = document.createElement("span");
    label.textContent = document.querySelector(".breadcrumbs [aria-current]")?.textContent.trim() || "On this page";
    pill.type = "button";
    pill.className = "page-pill";
    pill.append(label);
    toc.id = "page-sections";
    pill.setAttribute("aria-controls", toc.id);
    pill.setAttribute("aria-expanded", "false");
    brand.after(pill);

    const setSections = (open) => {
      header.classList.toggle("is-toc-open", open);
      pill.setAttribute("aria-expanded", String(open));
    };
    const wideScreen = window.matchMedia("(min-width: 1180px)");
    const placeSections = () => {
      setSections(false);
      (wideScreen.matches ? tocAside : header).append(toc);
    };
    placeSections();
    wideScreen.addEventListener("change", placeSections);
    pill.addEventListener("click", () => setSections(!header.classList.contains("is-toc-open")));
    toc.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("a")) setSections(false);
    });
    document.addEventListener("click", (event) => {
      if (event.target instanceof Node && !header.contains(event.target)) setSections(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setSections(false);
    });
    new IntersectionObserver(([entry]) => {
      header.classList.toggle("is-reading", !entry.isIntersecting);
      if (entry.isIntersecting) setSections(false);
    }).observe(pageTop);
  }

  document.querySelectorAll("[data-current-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });

  // ---- Smooth scroll (Lenis) ----
  // It loads after the page is usable, from the same folder as this file.
  // It is a plain script, so this also works when the page is opened from disk (file://).
  const isHome = document.body.classList.contains("landing-page");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  // Browsers often guess "3g" wrongly, so only data-saver and 2g count as slow. home.js reads the class.
  const slowConnection = /(^|-)2g$/.test(navigator.connection?.effectiveType || "");
  const lightWeight = Boolean(navigator.connection?.saveData) || slowConnection;
  document.documentElement.classList.toggle("light-weight", lightWeight);
  const assetBase = new URL("./", selfScript?.src || window.location.href);
  const assetQuery = selfScript ? new URL(selfScript.src).search : "";
  const loadScript = (name) =>
    new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL(name + assetQuery, assetBase).href;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${name}`));
      document.head.append(script);
    });

  // The home page does not scroll, so only the other pages get smooth scroll.
  if (!reducedMotion.matches && !isHome) {
    loadScript("scroll.js")
      .then(() => {
        window.lenis = window.PhilosophiaScroll.default();
      })
      .catch((error) => {
        console.warn("Smooth scroll not started; native scrolling stays.", error);
      });
  }
})();
