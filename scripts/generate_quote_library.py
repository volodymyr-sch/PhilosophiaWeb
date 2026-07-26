#!/usr/bin/env python3
"""Generate the crawlable Philosophia quote library and its editorial hubs.

The generator deliberately publishes a small, deterministic subset of the full
catalog.  Initial publication is balanced across the selected philosophers;
later monthly releases draw from the same quality-ranked queue in batches of 20.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path


PROJECT = Path(__file__).resolve().parent.parent
DATA = PROJECT / "data"
SITE = PROJECT / "website"
CANONICAL = "https://philosophia-org.github.io"
APP_STORE = "https://apps.apple.com/us/app/philosophy-daily-quotes/id6746213108"
PLAY_STORE = "https://play.google.com/store/apps/details?id=com.vlsch.serenity"
CSS_VERSION = "20260723-11"

INITIAL_AUTHORS = (
    "Marcus Aurelius",
    "Seneca the Younger",
    "Epictetus",
    "Plato",
    "Aristotle",
    "Socrates",
    "Confucius",
    "Lao Tzu",
    "Friedrich Nietzsche",
    "Immanuel Kant",
    "Søren Kierkegaard",
    "René Descartes",
    "David Hume",
    "Arthur Schopenhauer",
    "Baruch Spinoza",
)

WORKS = {
    "meditations": {
        "name": "Meditations",
        "author": "Marcus Aurelius",
        "match": ("Meditations",),
        "description": (
            "Read quotes attributed to Marcus Aurelius’s Meditations with the "
            "catalog source beside every passage and prompts for reading beyond the slogan."
        ),
        "intro": (
            "Meditations is a set of private philosophical exercises rather than a polished "
            "book written for an audience. Marcus returns to judgment, social duty, mortality, "
            "and attention because those disciplines require rehearsal. The entries below keep "
            "their catalog book references visible so a memorable sentence can become the start "
            "of reading, not the end of it."
        ),
    },
    "letters-from-a-stoic": {
        "name": "Letters from a Stoic",
        "author": "Seneca the Younger",
        "match": ("Letters from a Stoic", "Moral Letters"),
        "description": (
            "Explore Seneca quotes from Letters from a Stoic, organized with source labels, "
            "practical reflection prompts, and links to related Stoic ideas."
        ),
        "intro": (
            "Seneca’s Moral Letters address Lucilius while also teaching a wider reader how to "
            "examine time, friendship, fear, wealth, and character. A short line can conceal the "
            "letter’s argument, examples, and qualifications. Use this collection to identify the "
            "source first, then return to the complete letter before treating the line as advice."
        ),
    },
    "enchiridion": {
        "name": "Enchiridion",
        "author": "Epictetus",
        "match": ("Enchiridion",),
        "description": (
            "Read Epictetus quotes from the Enchiridion with a source-first lens, practical "
            "questions, and links to Stoic themes and related passages."
        ),
        "intro": (
            "The Enchiridion is Arrian’s compact handbook drawn from Epictetus’s teaching. Its "
            "brevity makes it memorable, but also easy to flatten into motivational commands. "
            "These quote records are arranged as entry points: inspect the claim, note what is "
            "said to be within or beyond agency, and compare it with the fuller Discourses."
        ),
    },
    "republic": {
        "name": "Republic",
        "author": "Plato",
        "match": ("Republic",),
        "description": (
            "Explore Plato quotes from the Republic with source labels and context-aware "
            "questions about justice, education, knowledge, and the good life."
        ),
        "intro": (
            "Plato’s Republic is a dialogue about justice in a person and a city, education, "
            "knowledge, political order, and the form of the good. A sentence may be spoken by "
            "Socrates or another character inside a developing argument. Treat each quotation as "
            "a doorway into the dialogue and check who is speaking, to whom, and at what stage."
        ),
    },
    "nicomachean-ethics": {
        "name": "Nicomachean Ethics",
        "author": "Aristotle",
        "match": ("Nicomachean Ethics",),
        "description": (
            "Read Aristotle quotes from the Nicomachean Ethics with source notes and practical "
            "questions about virtue, habit, choice, friendship, and flourishing."
        ),
        "intro": (
            "The Nicomachean Ethics asks what human flourishing requires and develops an account "
            "of virtue shaped through choice, habit, judgment, and community. Aristotle’s claims "
            "usually depend on distinctions made across a chapter. Use these records to locate a "
            "theme, then consult a complete edition before relying on a single modern formulation."
        ),
    },
}

TOPICS = {
    "resilience": {
        "name": "Resilience and adversity",
        "keyword": "philosophy quotes about resilience",
        "terms": (
            "adversity", "suffer", "suffering", "pain", "trouble", "difficult", "hardship",
            "endure", "obstacle", "fear", "courage", "strength", "misfortune", "fate",
            "control", "power", "anger", "death",
        ),
        "description": (
            "Explore sourced philosophy quotes about resilience, adversity, courage, control, "
            "and responding carefully when circumstances are difficult."
        ),
        "lens": (
            "Read this as a claim about response under pressure, not as a promise that hardship "
            "is harmless or fully controllable. Ask which part concerns action, which part concerns "
            "judgment, and what the line might overlook in another person’s circumstances."
        ),
        "steps": (
            "Name the event without adding an interpretation.",
            "Separate the response you can choose from conditions you cannot command.",
            "Choose one proportionate action that preserves both courage and care.",
        ),
    },
    "self-knowledge": {
        "name": "Self-knowledge and judgment",
        "keyword": "philosophy quotes about self knowledge",
        "terms": (
            "know", "knowledge", "mind", "think", "thought", "reason", "judgment",
            "understand", "wisdom", "truth", "ignorance", "learn", "perception", "doubt",
            "conscious", "idea", "belief", "opinion",
        ),
        "description": (
            "Explore sourced philosophy quotes about self-knowledge, reason, judgment, truth, "
            "learning, and the limits of what we think we know."
        ),
        "lens": (
            "Treat this line as an invitation to inspect a belief. Identify what it claims we can "
            "know, what evidence would challenge it, and whether the author is describing certainty, "
            "practical judgment, or intellectual humility."
        ),
        "steps": (
            "Restate the claim in plain language without its rhetorical force.",
            "Write one reason to accept it and one serious counterexample.",
            "Decide what further reading or experience would change your view.",
        ),
    },
    "virtue": {
        "name": "Virtue and character",
        "keyword": "philosophy quotes about virtue",
        "terms": (
            "virtue", "character", "duty", "good", "evil", "justice", "moral", "right",
            "wrong", "honest", "honor", "habit", "action", "act", "conduct", "excellence",
            "responsibility", "choice",
        ),
        "description": (
            "Explore sourced philosophy quotes about virtue, character, duty, justice, habit, "
            "and the choices through which a life takes shape."
        ),
        "lens": (
            "Read this as an ethical proposal rather than a decorative maxim. Ask what kind of "
            "person or action it commends, which competing duties it leaves unstated, and how the "
            "principle would look in a small decision today."
        ),
        "steps": (
            "Name the quality or duty the line appears to value.",
            "Test it against a case where two good obligations conflict.",
            "Translate the principle into one observable action rather than an intention.",
        ),
    },
    "happiness": {
        "name": "Happiness and meaning",
        "keyword": "philosophy quotes about happiness and life",
        "terms": (
            "happy", "happiness", "joy", "life", "live", "meaning", "purpose", "desire",
            "pleasure", "content", "peace", "love", "friend", "hope", "freedom", "beautiful",
            "soul", "flourish",
        ),
        "description": (
            "Explore sourced philosophy quotes about happiness, meaning, friendship, desire, "
            "freedom, and what it may mean to live well."
        ),
        "lens": (
            "Ask what this line means by a good life: a feeling, a pattern of action, a relationship, "
            "or a judgment about value. Compare that answer with your own before turning the quote "
            "into a rule for happiness."
        ),
        "steps": (
            "Identify the good the line places at the center of life.",
            "Ask whether that good is temporary, relational, chosen, or beyond control.",
            "Try one small practice that tests the idea without demanding a guaranteed mood.",
        ),
    },
}

SCHOOL_NAMES = (
    "Stoicism",
    "Platonism",
    "Aristotelianism",
    "Existentialism",
    "Rationalism",
    "Taoism",
)

AUTHOR_SCHOOL_FALLBACK = {
    "Socrates": "Platonism",
    "Confucius": "Self-knowledge and judgment",
    "Immanuel Kant": "Rationalism",
    "David Hume": "Self-knowledge and judgment",
    "Arthur Schopenhauer": "Existentialism",
}

RISKY_EDITORIAL_TERMS = (
    "cognitive behavioral therapy",
    "cognitive behavioural therapy",
    "mental health",
    "treat anxiety",
    "treat depression",
    "therapy draws",
)


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def slugify(value: str) -> str:
    value = (
        value.lower()
        .replace("ø", "o")
        .replace("æ", "ae")
        .replace("œ", "oe")
        .replace("ß", "ss")
    )
    value = unicodedata.normalize("NFKD", value)
    value = re.sub(r"[^\w\s-]", "", value, flags=re.UNICODE)
    value = value.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[-\s]+", "-", value).strip("-")


def sentence_excerpt(value: str, limit: int = 170) -> str:
    value = re.sub(r"\s+", " ", value).strip()
    if len(value) <= limit:
        return value
    shortened = value[: limit + 1].rsplit(" ", 1)[0].rstrip(".,;:—- ")
    return shortened + "…"


def title_excerpt(value: str, limit: int = 58) -> str:
    value = re.sub(r"\s+", " ", value).strip().rstrip(".")
    if len(value) <= limit:
        return value
    return value[: limit + 1].rsplit(" ", 1)[0].rstrip(".,;:—- ") + "…"


def paragraphs(value: str) -> list[str]:
    blocks = [re.sub(r"\s+", " ", block).strip() for block in re.split(r"\n\s*\n", value)]
    return [block for block in blocks if block]


def safe_editorial_paragraphs(value: str) -> list[str]:
    """Keep supplied editorial copy while excluding unsupported therapy claims."""
    return [
        block
        for block in paragraphs(value)
        if not any(term in block.casefold() for term in RISKY_EDITORIAL_TERMS)
    ]


def english_translation(item: dict) -> dict:
    return next(
        (translation for translation in item.get("translations", []) if translation.get("language") == "en"),
        item.get("translations", [{}])[0],
    )


def normalize_quotes(raw: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for item in raw:
        translation = english_translation(item)
        text = re.sub(r"\s+", " ", translation.get("text", "")).strip()
        author = re.sub(r"\s+", " ", translation.get("author", "")).strip()
        source = re.sub(r"\s+", " ", translation.get("source", "")).strip()
        if not text or not author or not source:
            continue
        rows.append(
            {
                "id": item["id"],
                "text": text,
                "author": author,
                "source": source,
                "likeCount": int(item.get("likeCount", 0)),
            }
        )
    return rows


def source_quality(source: str) -> int:
    lowered = source.casefold()
    if "attributed" in lowered or "various sources" in lowered:
        return -1000
    score = 0
    if any(token in lowered for token in ("book ", "part ", "letter ", "chapter ")):
        score += 45
    if re.search(r"\d", source):
        score += 18
    if lowered in {"fragments", "sayings", "works", "unknown"}:
        score -= 80
    elif "fragment" in lowered:
        score -= 35
    else:
        score += 35
    return score


def quote_score(row: dict) -> int:
    length = len(row["text"])
    length_score = 45 if 38 <= length <= 190 else 15 if 22 <= length <= 240 else -60
    punctuation_score = 8 if row["text"][-1:] in ".?!" else 0
    return min(row["likeCount"], 220) + source_quality(row["source"]) + length_score + punctuation_score


def classify_topic(text: str) -> str:
    lowered = f" {text.casefold()} "
    scores = {
        slug: sum(1 for term in topic["terms"] if re.search(rf"\b{re.escape(term)}", lowered))
        for slug, topic in TOPICS.items()
    }
    return max(TOPICS, key=lambda slug: (scores[slug], -list(TOPICS).index(slug)))


def anchor_phrase(text: str, topic_slug: str) -> str:
    words = re.findall(r"[\w’'-]+", text)
    lowered = [word.casefold().strip("’'-") for word in words]
    terms = TOPICS[topic_slug]["terms"]
    position = next((i for i, word in enumerate(lowered) if word in terms), 0)
    start = max(0, position - 3)
    end = min(len(words), start + 9)
    start = max(0, end - 9)
    return " ".join(words[start:end]).strip()


def quote_slug_map(rows: list[dict]) -> dict[str, str]:
    preliminary: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        phrase = "-".join(slugify(row["text"]).split("-")[:9])
        base = f"{slugify(row['author'])}-{phrase}"[:92].rstrip("-")
        preliminary[base].append(row)
    result: dict[str, str] = {}
    for base, matches in preliminary.items():
        for row in sorted(matches, key=lambda candidate: candidate["id"]):
            suffix = ""
            if len(matches) > 1:
                suffix = "-" + hashlib.sha1(row["id"].encode()).hexdigest()[:6]
            result[row["id"]] = base + suffix
    return result


def rank_queue(rows: list[dict]) -> list[dict]:
    seen_text: set[str] = set()
    candidates = []
    for row in rows:
        normalized = re.sub(r"[^\w]+", " ", row["text"].casefold()).strip()
        if normalized in seen_text or source_quality(row["source"]) < 0:
            continue
        if not 22 <= len(row["text"]) <= 240:
            continue
        seen_text.add(normalized)
        candidates.append(row)
    return sorted(candidates, key=lambda row: (-quote_score(row), row["author"], row["text"], row["id"]))


def initial_selection(queue: list[dict]) -> list[dict]:
    by_author: dict[str, list[dict]] = defaultdict(list)
    for row in queue:
        by_author[row["author"]].append(row)
    selected: list[dict] = []
    for author in INITIAL_AUTHORS:
        source_counts: Counter[str] = Counter()
        author_rows: list[dict] = []
        priority_work = next(
            (work for work in WORKS.values() if work["author"] == author),
            None,
        )
        if priority_work:
            for row in by_author[author]:
                if not any(
                    row["source"].casefold().startswith(match.casefold())
                    for match in priority_work["match"]
                ):
                    continue
                author_rows.append(row)
                source_counts[row["source"]] += 1
                if len(author_rows) == 3:
                    break
        for row in by_author[author]:
            if row in author_rows:
                continue
            if source_counts[row["source"]] >= 3:
                continue
            author_rows.append(row)
            source_counts[row["source"]] += 1
            if len(author_rows) == 10:
                break
        if len(author_rows) < 10:
            for row in by_author[author]:
                if row not in author_rows:
                    author_rows.append(row)
                if len(author_rows) == 10:
                    break
        if len(author_rows) != 10:
            raise RuntimeError(f"Not enough qualified quotes for {author}: {len(author_rows)}")
        selected.extend(author_rows)
    return selected


def read_data() -> tuple[list[dict], dict[str, dict], dict[str, dict], dict[str, str]]:
    quotes = normalize_quotes(json.loads((DATA / "quotes-en.json").read_text(encoding="utf-8")))
    philosophers_raw = json.loads((DATA / "philosophers-en.json").read_text(encoding="utf-8"))
    philosophies_raw = json.loads((DATA / "philosophies-en.json").read_text(encoding="utf-8"))

    philosophers: dict[str, dict] = {}
    philosopher_id_to_name: dict[str, str] = {}
    for item in philosophers_raw:
        translation = english_translation(item)
        name = translation["name"]
        philosophers[name] = {
            "id": item["id"],
            "name": name,
            "biography": translation.get("biography", ""),
        }
        philosopher_id_to_name[item["id"]] = name

    philosophies: dict[str, dict] = {}
    author_school: dict[str, str] = {}
    for item in philosophies_raw:
        translation = english_translation(item)
        name = translation["name"]
        related = [
            philosopher_id_to_name[philosopher_id]
            for philosopher_id in item.get("relatedPhilosophers", [])
            if philosopher_id in philosopher_id_to_name
        ]
        philosophies[name] = {
            "id": item["id"],
            "name": name,
            "synopsis": translation.get("synopsis", ""),
            "description": translation.get("description", ""),
            "authors": related,
        }
        for author in related:
            author_school.setdefault(author, name)
    return quotes, philosophers, philosophies, author_school


def month_key(value: date) -> str:
    return f"{value.year:04d}-{value.month:02d}"


def months_between(start_month: str, end_month: str) -> list[str]:
    year, month = map(int, start_month.split("-"))
    end_year, end_value = map(int, end_month.split("-"))
    result = []
    while (year, month) <= (end_year, end_value):
        result.append(f"{year:04d}-{month:02d}")
        month += 1
        if month == 13:
            year += 1
            month = 1
    return result


def load_or_create_manifest(queue: list[dict], requested_date: date) -> dict:
    manifest_path = DATA / "quote-publication.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    else:
        initial = initial_selection(queue)
        manifest = {
            "schemaVersion": 1,
            "initialPublicationDate": "2026-07-23",
            "initialQuoteIds": [row["id"] for row in initial],
            "monthlyBatchSize": 20,
            "monthlyBatches": [],
            "selectionPolicy": (
                "Named-source English records, de-duplicated text, useful reading length, "
                "popularity signal, source specificity, and balanced initial philosopher coverage."
            ),
        }

    start_month = manifest["initialPublicationDate"][:7]
    current_month = month_key(requested_date)
    if current_month > start_month:
        existing_months = {batch["month"] for batch in manifest["monthlyBatches"]}
        used = set(manifest["initialQuoteIds"])
        for batch in manifest["monthlyBatches"]:
            used.update(batch["quoteIds"])
        eligible = [
            row
            for row in queue
            if row["id"] not in used and row["author"] in INITIAL_AUTHORS
        ]
        for month in months_between(start_month, current_month)[1:]:
            if month in existing_months:
                continue
            batch_size = int(manifest["monthlyBatchSize"])
            chosen = eligible[:batch_size]
            if len(chosen) < batch_size:
                raise RuntimeError("The ranked quote queue is exhausted.")
            manifest["monthlyBatches"].append(
                {
                    "month": month,
                    "publishDate": f"{month}-01",
                    "quoteIds": [row["id"] for row in chosen],
                }
            )
            chosen_ids = {row["id"] for row in chosen}
            eligible = [row for row in eligible if row["id"] not in chosen_ids]

    manifest["monthlyBatches"] = sorted(manifest["monthlyBatches"], key=lambda batch: batch["month"])
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def published_ids(manifest: dict, requested_date: date) -> tuple[list[str], dict[str, str]]:
    identifiers = list(manifest["initialQuoteIds"])
    dates = {identifier: manifest["initialPublicationDate"] for identifier in identifiers}
    for batch in manifest["monthlyBatches"]:
        if batch["publishDate"] <= requested_date.isoformat():
            identifiers.extend(batch["quoteIds"])
            dates.update({identifier: batch["publishDate"] for identifier in batch["quoteIds"]})
    return identifiers, dates


def relative_path(section: str) -> str:
    return ".."


def nav(current: str, location: str) -> str:
    quote_current = ' aria-current="page"' if current == "quotes" else ""
    guide_current = ' aria-current="page"' if current == "guides" else ""
    faq_current = ' aria-current="page"' if current == "faq" else ""
    return f"""
    <header class="site-header">
      <div class="container nav-wrap">
        <a class="brand" href="../index.html" aria-label="Philosophia home"><img src="../assets/images/app-icon-128.webp" width="38" height="38" alt=""><span>Philosophia</span></a>
        <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-navigation" aria-label="Open navigation"><span></span></button>
        <nav class="site-nav" id="site-navigation" aria-label="Main navigation">
          <a href="../quotes/index.html"{quote_current}>Quotes</a>
          <a href="../guides/index.html"{guide_current}>Guides</a>
          <a href="../faq.html"{faq_current}>FAQ</a>
          <span class="nav-store-actions" aria-label="Download Philosophia">
            <a class="button button-small" href="{APP_STORE}" data-location="{esc(location)}-header-app-store" rel="noopener">App Store</a>
            <a class="button button-small" href="{PLAY_STORE}" data-location="{esc(location)}-header-google-play" rel="noopener">Google Play</a>
          </span>
        </nav>
      </div>
    </header>"""


def footer(location: str) -> str:
    return f"""
    <footer class="site-footer">
      <div class="container footer-grid">
        <div class="footer-brand"><a class="brand" href="../index.html"><img src="../assets/images/app-icon-128.webp" width="38" height="38" alt=""><span>Philosophia</span></a><p>Daily wisdom from history’s greatest minds.</p></div>
        <div class="footer-col"><h2>Download</h2><a href="{APP_STORE}" data-location="{esc(location)}-footer-app-store" rel="noopener">App Store</a><a href="{PLAY_STORE}" data-location="{esc(location)}-footer-google-play" rel="noopener">Google Play</a></div>
        <div class="footer-col"><h2>Explore</h2><a href="../quotes/index.html">Quote library</a><a href="../philosophers/index.html">Philosophers</a><a href="../works/index.html">Works</a><a href="../schools/index.html">Schools</a><a href="../topics/index.html">Topics</a><a href="../guides/index.html">Guides</a><a href="../faq.html">FAQ</a></div>
        <div class="footer-col"><h2>Support</h2><a href="https://philosophia-org.github.io/privacy-policy/">Privacy policy</a><a href="mailto:philosophia.application@gmail.com">Contact</a></div>
      </div>
      <div class="container footer-bottom"><span>© <span data-current-year>2026</span> VlSch.</span><span>Read the line. Follow the source.</span></div>
    </footer>"""


def store_cta(location: str, heading: str, copy: str) -> str:
    return f"""
      <section class="section section-tight" aria-labelledby="{esc(location)}-cta-title">
        <div class="container"><div class="cta-band">
          <p class="eyebrow">Carry the idea with you</p>
          <h2 id="{esc(location)}-cta-title">{esc(heading)}</h2>
          <p>{esc(copy)}</p>
          <div class="cta-store-actions" aria-label="Download Philosophia">
            <a class="button" href="{APP_STORE}" data-location="{esc(location)}-cta-app-store" rel="noopener">App Store</a>
            <a class="button" href="{PLAY_STORE}" data-location="{esc(location)}-cta-google-play" rel="noopener">Google Play</a>
          </div>
        </div></div>
      </section>"""


def head(
    *,
    title: str,
    description: str,
    canonical_path: str,
    page_type: str,
    json_ld: dict,
) -> str:
    canonical = CANONICAL + canonical_path
    og_type = "article" if page_type == "article" else "website"
    return f"""<!doctype html>
<html lang="en-US">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{esc(title)}</title>
    <meta name="description" content="{esc(description)}">
    <meta name="robots" content="index,follow,max-image-preview:large">
    <meta name="theme-color" content="#050505">
    <link rel="canonical" href="{esc(canonical)}">
    <link rel="icon" type="image/png" href="../favicon.png">
    <link rel="apple-touch-icon" href="../apple-touch-icon.png">
    <link rel="stylesheet" href="../assets/css/styles.css?v={CSS_VERSION}">
    <meta property="og:type" content="{og_type}">
    <meta property="og:site_name" content="Philosophia">
    <meta property="og:title" content="{esc(title)}">
    <meta property="og:description" content="{esc(description)}">
    <meta property="og:url" content="{esc(canonical)}">
    <meta property="og:image" content="{CANONICAL}/assets/app-store/originals/social-card.png">
    <meta name="twitter:card" content="summary_large_image">
    <script type="application/ld+json">{json.dumps(json_ld, ensure_ascii=False, separators=(",", ":"))}</script>
    <script src="../assets/js/main.js?v={CSS_VERSION}" defer></script>
  </head>"""


def breadcrumb_json(items: list[tuple[str, str]]) -> dict:
    return {
        "@type": "BreadcrumbList",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": position,
                "name": name,
                "item": CANONICAL + path,
            }
            for position, (name, path) in enumerate(items, start=1)
        ],
    }


def breadcrumb_html(items: list[tuple[str, str]]) -> str:
    parts = []
    for index, (name, path) in enumerate(items):
        if index == len(items) - 1:
            parts.append(f'<span aria-current="page">{esc(name)}</span>')
        else:
            parts.append(f'<a href="..{esc(path)}">{esc(name)}</a><span>/</span>')
    return "".join(parts)


def find_school(author: str, author_school: dict[str, str]) -> str | None:
    school = author_school.get(author)
    if school in SCHOOL_NAMES:
        return school
    fallback = AUTHOR_SCHOOL_FALLBACK.get(author)
    return fallback if fallback in SCHOOL_NAMES else None


def find_work(author: str, source: str) -> str | None:
    for slug, work in WORKS.items():
        if author == work["author"] and any(
            source.casefold().startswith(match.casefold()) for match in work["match"]
        ):
            return slug
    return None


def quote_card(row: dict, slugs: dict[str, str], prefix: str = "../quotes/") -> str:
    return f"""
        <a class="quote-card" href="{prefix}{esc(slugs[row['id']])}.html">
          <blockquote>“{esc(row['text'])}”</blockquote>
          <span>{esc(row['author'])}</span>
          <small>{esc(row['source'])}</small>
        </a>"""


def quote_page(
    row: dict,
    slugs: dict[str, str],
    philosophers: dict[str, dict],
    author_school: dict[str, str],
    published_rows: list[dict],
    publish_date: str,
) -> str:
    slug = slugs[row["id"]]
    path = f"/quotes/{slug}.html"
    preview = title_excerpt(row["text"])
    title = f"“{preview}” — {row['author']} Quote | Philosophia"
    description = sentence_excerpt(
        f'Read “{row["text"]}” by {row["author"]}, attributed in the Philosophia catalog '
        f'to {row["source"]}, with a source lens, reflection prompts, and related ideas.',
        176,
    )
    topic_slug = classify_topic(row["text"])
    topic = TOPICS[topic_slug]
    author_slug = slugify(row["author"])
    school = find_school(row["author"], author_school)
    work_slug = find_work(row["author"], row["source"])
    author_bio = philosophers.get(row["author"], {}).get("biography", "")
    author_blocks = safe_editorial_paragraphs(author_bio)
    author_context = (
        sentence_excerpt(author_blocks[0], 520)
        if author_blocks
        else f"{row['author']} is represented in Philosophia’s English quote catalog."
    )
    anchor = anchor_phrase(row["text"], topic_slug)

    related_candidates = [
        candidate for candidate in published_rows
        if candidate["id"] != row["id"] and (
            candidate["author"] == row["author"]
            or classify_topic(candidate["text"]) == topic_slug
            or candidate["source"] == row["source"]
        )
    ]
    related_candidates.sort(
        key=lambda candidate: (
            candidate["author"] != row["author"],
            candidate["source"] != row["source"],
            -candidate["likeCount"],
            candidate["text"],
        )
    )
    related = related_candidates[:3]

    source_status = (
        "The catalog gives a named work and a more specific book, part, letter, or section label. "
        "That is a stronger starting point, but wording can still vary by translation and edition."
        if re.search(r"\b(Book|Part|Letter|Chapter)\b|\d", row["source"], re.I)
        else
        "The catalog gives a named work but not an edition, translator, page, or section. "
        "Use the title to locate the passage, then compare the surrounding argument and wording."
    )
    school_link = (
        f'<a class="detail-chip" href="../schools/{slugify(school)}.html">{esc(school)}</a>'
        if school
        else ""
    )
    work_link = (
        f'<a class="detail-chip" href="../works/{work_slug}.html">{esc(WORKS[work_slug]["name"])}</a>'
        if work_slug
        else f'<span class="detail-chip">{esc(row["source"])}</span>'
    )
    related_html = "".join(quote_card(candidate, slugs) for candidate in related)
    steps_html = "".join(f"<li>{esc(step)}</li>" for step in topic["steps"])

    json_ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Article",
                "headline": f"{row['author']} quote from {row['source']}",
                "description": description,
                "mainEntityOfPage": CANONICAL + path,
                "datePublished": publish_date,
                "dateModified": publish_date,
                "inLanguage": "en-US",
                "author": {"@id": f"{CANONICAL}/#organization"},
                "publisher": {"@id": f"{CANONICAL}/#organization"},
                "about": [
                    {"@type": "Person", "name": row["author"]},
                    {"@type": "CreativeWork", "name": row["source"]},
                    {"@type": "Thing", "name": topic["name"]},
                ],
                "text": row["text"],
                "citation": row["source"],
            },
            breadcrumb_json(
                [
                    ("Home", "/"),
                    ("Quotes", "/quotes/"),
                    (f"{row['author']} quote", path),
                ]
            ),
        ],
    }
    return (
        head(
            title=title,
            description=description,
            canonical_path=path,
            page_type="article",
            json_ld=json_ld,
        )
        + f"""
  <body class="content-page quote-page">
    <a class="skip-link" href="#quote-content">Skip to quote</a>
    {nav("quotes", f"quote-{slug}")}
    <main id="quote-content">
      <header class="quote-hero">
        <div class="narrow">
          <nav class="breadcrumbs" aria-label="Breadcrumb">{breadcrumb_html([("Home", "/index.html"), ("Quotes", "/quotes/index.html"), (row["author"], path)])}</nav>
          <p class="eyebrow">{esc(topic["name"])}</p>
          <blockquote>“{esc(row["text"])}”</blockquote>
          <p class="quote-attribution"><a href="../philosophers/{author_slug}.html">{esc(row["author"])}</a><span>{esc(row["source"])}</span></p>
          <div class="detail-chips"><a class="detail-chip" href="../philosophers/{author_slug}.html">{esc(row["author"])}</a>{work_link}{school_link}<a class="detail-chip" href="../topics/{topic_slug}.html">{esc(topic["name"])}</a></div>
        </div>
      </header>

      <div class="container quote-layout">
        <article class="prose quote-prose">
          <section aria-labelledby="meaning-title">
            <p class="eyebrow">Interpretation</p>
            <h1 id="meaning-title">What this {esc(row["author"])} quote asks you to notice</h1>
            <p>The operative phrase is <strong>“{esc(anchor)}.”</strong> {esc(topic["lens"])}</p>
            <p>This page does not treat one sentence as a complete account of {esc(row["author"])}’s philosophy. It uses the quote as a reading prompt: identify the claim, test its limits, and follow the source before applying it as advice.</p>
          </section>

          <section class="source-lens" aria-labelledby="source-lens-title">
            <div><p class="eyebrow">Source Lens</p><h2 id="source-lens-title">Follow the attribution, not just the image.</h2></div>
            <dl>
              <div><dt>Author</dt><dd><a href="../philosophers/{author_slug}.html">{esc(row["author"])}</a></dd></div>
              <div><dt>Catalog source</dt><dd>{esc(row["source"])}</dd></div>
              <div><dt>Record</dt><dd><code>{esc(row["id"])}</code></dd></div>
              <div><dt>Reading status</dt><dd>{esc(source_status)}</dd></div>
            </dl>
            <p class="source-caution"><strong>Attribution note:</strong> Philosophia’s public record supplies the wording, author, and source label. It does not specify an edition or translator. Before academic use or republication, verify the line in a complete edition and cite that edition directly.</p>
          </section>

          <section aria-labelledby="context-title">
            <h2 id="context-title">About {esc(row["author"])}</h2>
            <p>{esc(author_context)}</p>
            <p><a class="text-link" href="../philosophers/{author_slug}.html">Read the {esc(row["author"])} profile</a></p>
          </section>

          <section aria-labelledby="reflect-title">
            <h2 id="reflect-title">A three-step reflection</h2>
            <ol>{steps_html}</ol>
            <p>Return to the exact wording after answering. If your conclusion could have been reached without reading the quote, look again for a distinction or assumption you missed.</p>
          </section>

          <section aria-labelledby="app-title">
            <h2 id="app-title">Use this quote in Philosophia</h2>
            <div class="guide-callout"><p>Find {esc(row["author"])} in the app, save the line to a {esc(topic["name"])} collection, and keep the source visible when you revisit it.</p></div>
            <p>Use a widget or notification as the reminder, then open the app when the sentence deserves more than a glance. Compare it with another quote from the same thinker or school before deciding what it means for your day.</p>
          </section>

        </article>
        <aside class="quote-aside" aria-label="Quote details">
          <div class="toc"><strong>On this page</strong><a href="#meaning-title">Interpretation</a><a href="#source-lens-title">Source Lens</a><a href="#context-title">About the philosopher</a><a href="#reflect-title">Reflection</a><a href="#app-title">Use the app</a></div>
        </aside>
      </div>

      <section class="related-section" aria-labelledby="related-quotes-title"><div class="container"><p class="eyebrow">Keep reading</p><h2 id="related-quotes-title">Related sourced quotes</h2><div class="quote-grid">{related_html}</div></div></section>
      {store_cta(f"quote-{slug}", "Keep the source attached to the thought.", "Save quotes, build collections, and explore philosophers on iOS or Android.")}
    </main>
    {footer(f"quote-{slug}")}
  </body>
</html>
"""
    )


def collection_page(
    *,
    section: str,
    title: str,
    description: str,
    eyebrow: str,
    heading: str,
    lede: str,
    cards: str,
    count_label: str,
) -> str:
    path = f"/{section}/"
    json_ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "CollectionPage",
                "name": title,
                "description": description,
                "url": CANONICAL + path,
                "inLanguage": "en-US",
                "isPartOf": {"@id": f"{CANONICAL}/#website"},
            },
            breadcrumb_json([("Home", "/"), (heading, path)]),
        ],
    }
    return (
        head(
            title=title,
            description=description,
            canonical_path=path,
            page_type="website",
            json_ld=json_ld,
        )
        + f"""
  <body class="content-page library-page">
    <a class="skip-link" href="#library-content">Skip to {esc(heading.lower())}</a>
    {nav("quotes", f"{section}-index")}
    <main id="library-content">
      <header class="guide-hero hub-hero"><div class="container">
        <nav class="breadcrumbs" aria-label="Breadcrumb">{breadcrumb_html([("Home", "/index.html"), (heading, path)])}</nav>
        <p class="eyebrow">{esc(eyebrow)}</p>
        <h1>{esc(heading)}</h1>
        <p class="lede">{esc(lede)}</p>
        <div class="guide-meta"><span>{esc(count_label)}</span><span>English</span><span>Source-aware</span></div>
      </div></header>
      <section class="section"><div class="container"><div class="library-grid">{cards}</div></div></section>
      {store_cta(f"{section}-index", "Take the library with you.", "Save quotes and move between thinkers, works, and schools in Philosophia.")}
    </main>
    {footer(f"{section}-index")}
  </body>
</html>
"""
    )


def hub_page(
    *,
    section: str,
    slug: str,
    title: str,
    description: str,
    eyebrow: str,
    heading: str,
    lede: str,
    article_html: str,
    quote_rows: list[dict],
    quote_slugs: dict[str, str],
    published_date: str,
) -> str:
    path = f"/{section}/{slug}.html"
    cards = "".join(quote_card(row, quote_slugs) for row in quote_rows[:12])
    json_ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "CollectionPage",
                "name": heading,
                "description": description,
                "url": CANONICAL + path,
                "datePublished": published_date,
                "dateModified": published_date,
                "inLanguage": "en-US",
                "isPartOf": {"@id": f"{CANONICAL}/#website"},
            },
            breadcrumb_json(
                [("Home", "/"), (section.title(), f"/{section}/"), (heading, path)]
            ),
        ],
    }
    return (
        head(
            title=title,
            description=description,
            canonical_path=path,
            page_type="website",
            json_ld=json_ld,
        )
        + f"""
  <body class="content-page hub-page">
    <a class="skip-link" href="#hub-content">Skip to content</a>
    {nav("quotes", f"{section}-{slug}")}
    <main id="hub-content">
      <header class="guide-hero hub-hero"><div class="container">
        <nav class="breadcrumbs" aria-label="Breadcrumb">{breadcrumb_html([("Home", "/index.html"), (section.title(), f"/{section}/index.html"), (heading, path)])}</nav>
        <p class="eyebrow">{esc(eyebrow)}</p>
        <h1>{esc(heading)}</h1>
        <p class="lede">{esc(lede)}</p>
        <div class="guide-meta"><span>{len(quote_rows)} published quotes</span><span>Source-aware collection</span></div>
      </div></header>
      <div class="container hub-layout"><article class="prose">{article_html}</article></div>
      <section class="related-section" aria-labelledby="{esc(slug)}-quotes-title"><div class="container"><p class="eyebrow">Read the records</p><h2 id="{esc(slug)}-quotes-title">Quotes in this collection</h2><div class="quote-grid">{cards}</div></div></section>
      {store_cta(f"{section}-{slug}", "Explore the complete collection in Philosophia.", "Save sourced passages and discover related thinkers on iOS or Android.")}
    </main>
    {footer(f"{section}-{slug}")}
  </body>
</html>
"""
    )


def generate(
    requested_date: date,
    rows: list[dict],
    philosophers: dict[str, dict],
    philosophies: dict[str, dict],
    author_school: dict[str, str],
) -> tuple[int, int]:
    queue = rank_queue(rows)
    manifest = load_or_create_manifest(queue, requested_date)
    identifiers, publication_dates = published_ids(manifest, requested_date)
    by_id = {row["id"]: row for row in rows}
    published = [by_id[identifier] for identifier in identifiers if identifier in by_id]
    slugs = quote_slug_map(rows)
    generated_dirs = ("quotes", "philosophers", "works", "schools", "topics")
    for directory in generated_dirs:
        destination = SITE / directory
        destination.mkdir(parents=True, exist_ok=True)
        for old_page in destination.glob("*.html"):
            old_page.unlink()

    for row in published:
        page = quote_page(
            row,
            slugs,
            philosophers,
            author_school,
            published,
            publication_dates[row["id"]],
        )
        (SITE / "quotes" / f"{slugs[row['id']]}.html").write_text(page, encoding="utf-8")

    quote_cards = "".join(
        quote_card(row, slugs, prefix="") for row in sorted(
            published, key=lambda candidate: (-candidate["likeCount"], candidate["author"])
        )
    )
    (SITE / "quotes" / "index.html").write_text(
        collection_page(
            section="quotes",
            title="Sourced Philosophy Quotes Library | Philosophia",
            description=(
                "Browse sourced philosophy quotes by author, work, school, and topic. "
                "Each reading page keeps its catalog attribution and Source Lens visible."
            ),
            eyebrow="Source Lens library",
            heading="Philosophy quotes worth following to the source.",
            lede=(
                "Begin with a memorable line, inspect its catalog attribution, reflect on "
                "the claim, and continue into the thinker, work, school, or topic behind it."
            ),
            cards=quote_cards,
            count_label=f"{len(published)} published quote pages",
        ),
        encoding="utf-8",
    )

    by_author: dict[str, list[dict]] = defaultdict(list)
    for row in published:
        by_author[row["author"]].append(row)

    author_cards = []
    for author in INITIAL_AUTHORS:
        profile = philosophers[author]
        author_slug = slugify(author)
        author_quotes = sorted(
            by_author[author], key=lambda candidate: (-candidate["likeCount"], candidate["text"])
        )
        school = find_school(author, author_school)
        biography_html = "".join(
            f"<p>{esc(block)}</p>"
            for block in safe_editorial_paragraphs(profile["biography"])
        )
        links = [
            '<a class="detail-chip" href="../quotes/index.html">Quote library</a>',
        ]
        if school:
            links.append(
                f'<a class="detail-chip" href="../schools/{slugify(school)}.html">{esc(school)}</a>'
            )
        article_html = f"""
          <div class="answer-box"><p>{esc(sentence_excerpt(profile["biography"], 320))}</p></div>
          <div class="detail-chips">{''.join(links)}</div>
          <h2 id="life-and-work">Life, work, and philosophical context</h2>
          {biography_html}
          <h2 id="read-carefully">How to read {esc(author)} quotes carefully</h2>
          <p>Start with the source label attached to each record. Locate the complete work, identify the speaker and surrounding argument, and compare translations where wording differs. A quotation can introduce a question; it cannot replace the text that gives the question its shape.</p>
          <p>Save passages by theme rather than by fame. A focused collection makes agreements, tensions, and repeated concepts easier to see than one undifferentiated list of favorites.</p>"""
        (SITE / "philosophers" / f"{author_slug}.html").write_text(
            hub_page(
                section="philosophers",
                slug=author_slug,
                title=f"{author} Quotes, Biography, and Sources | Philosophia",
                description=sentence_excerpt(
                    f"Explore {author} quotes with source labels, a detailed biography, "
                    "historical context, reflection prompts, and links to related philosophy.",
                    176,
                ),
                eyebrow="Philosopher profile",
                heading=f"{author}: quotes, life, and sources",
                lede=sentence_excerpt(profile["biography"], 300),
                article_html=article_html,
                quote_rows=author_quotes,
                quote_slugs=slugs,
                published_date="2026-07-23",
            ),
            encoding="utf-8",
        )
        author_cards.append(
            f"""<a class="library-card" href="{author_slug}.html"><span>Philosopher</span><h2>{esc(author)}</h2><p>{esc(sentence_excerpt(profile["biography"], 150))}</p><small>{len(author_quotes)} published quotes →</small></a>"""
        )

    (SITE / "philosophers" / "index.html").write_text(
        collection_page(
            section="philosophers",
            title="Philosophers: Biographies, Quotes, and Sources | Philosophia",
            description=(
                "Explore 15 philosopher profiles with detailed biographies, source-aware "
                "quote collections, schools of thought, and practical reading prompts."
            ),
            eyebrow="People behind the ideas",
            heading="Philosophers",
            lede=(
                "Meet the thinkers behind the quotations. Each profile connects biography, "
                "philosophical context, source labels, and the passages published in this library."
            ),
            cards="".join(author_cards),
            count_label=f"{len(INITIAL_AUTHORS)} philosopher hubs",
        ),
        encoding="utf-8",
    )

    work_cards = []
    for work_slug, work in WORKS.items():
        work_quotes = [
            row for row in published
            if row["author"] == work["author"]
            and any(row["source"].casefold().startswith(match.casefold()) for match in work["match"])
        ]
        work_quotes.sort(key=lambda candidate: (-candidate["likeCount"], candidate["text"]))
        article_html = f"""
          <div class="answer-box"><p>{esc(work["intro"])}</p></div>
          <h2 id="source-lens">How to use the Source Lens</h2>
          <p>Source labels in the public catalog identify the work, and some identify a book or section. They do not identify an edition, translator, or page. Use the label as a locator, then verify the wording and context in the edition you actually cite.</p>
          <ol><li>Open the complete work and locate the passage or nearest matching formulation.</li><li>Read the surrounding chapter, letter, or exchange.</li><li>Record the translator, edition, and stable section number before sharing it as a quotation.</li></ol>
          <h2 id="read-in-app">Build a work-based collection</h2>
          <p>Save these passages together in Philosophia, then group your notes by recurring question rather than by how motivational a sentence sounds. A work-based collection helps a reader see development, disagreement, and qualification across multiple passages.</p>"""
        (SITE / "works" / f"{work_slug}.html").write_text(
            hub_page(
                section="works",
                slug=work_slug,
                title=f"{work['name']} Quotes by {work['author']} | Philosophia",
                description=work["description"],
                eyebrow="Work and source hub",
                heading=f"{work['name']} quotes",
                lede=work["intro"],
                article_html=article_html,
                quote_rows=work_quotes,
                quote_slugs=slugs,
                published_date="2026-07-23",
            ),
            encoding="utf-8",
        )
        work_cards.append(
            f"""<a class="library-card" href="{work_slug}.html"><span>Primary work</span><h2>{esc(work["name"])}</h2><p>{esc(work["description"])}</p><small>{len(work_quotes)} published quotes →</small></a>"""
        )

    (SITE / "works" / "index.html").write_text(
        collection_page(
            section="works",
            title="Philosophy Works and Sourced Quote Collections | Philosophia",
            description=(
                "Browse philosophy quote collections by work, including Meditations, Republic, "
                "the Enchiridion, Letters from a Stoic, and Nicomachean Ethics."
            ),
            eyebrow="Follow the citation",
            heading="Works",
            lede=(
                "Move from isolated quotations to the books, dialogues, letters, and handbooks "
                "that give them context."
            ),
            cards="".join(work_cards),
            count_label=f"{len(WORKS)} work hubs",
        ),
        encoding="utf-8",
    )

    school_cards = []
    for school_name in SCHOOL_NAMES:
        school = philosophies[school_name]
        school_slug = slugify(school_name)
        related_authors = set(school["authors"])
        school_quotes = [row for row in published if row["author"] in related_authors]
        school_quotes.sort(key=lambda candidate: (-candidate["likeCount"], candidate["author"]))
        description_blocks = safe_editorial_paragraphs(school["description"])
        article_html = f"""
          <div class="answer-box"><p>{esc(school["synopsis"])}</p></div>
          <h2 id="overview">What is {esc(school_name)}?</h2>
          {''.join(f"<p>{esc(block)}</p>" for block in description_blocks)}
          <h2 id="read-school">Read across the school</h2>
          <p>No school is reducible to one modern slogan. Compare passages from its associated thinkers, note historical differences, and use the linked source records to continue into complete texts.</p>"""
        (SITE / "schools" / f"{school_slug}.html").write_text(
            hub_page(
                section="schools",
                slug=school_slug,
                title=f"{school_name}: Ideas, Philosophers, and Quotes | Philosophia",
                description=sentence_excerpt(
                    f"Learn about {school_name}, its core ideas and philosophers, then explore "
                    "source-aware quotes with practical reading prompts.",
                    176,
                ),
                eyebrow="School of thought",
                heading=f"{school_name}: ideas and quotes",
                lede=school["synopsis"],
                article_html=article_html,
                quote_rows=school_quotes,
                quote_slugs=slugs,
                published_date="2026-07-23",
            ),
            encoding="utf-8",
        )
        school_cards.append(
            f"""<a class="library-card" href="{school_slug}.html"><span>School of thought</span><h2>{esc(school_name)}</h2><p>{esc(school["synopsis"])}</p><small>{len(school_quotes)} published quotes →</small></a>"""
        )

    (SITE / "schools" / "index.html").write_text(
        collection_page(
            section="schools",
            title="Schools of Philosophy: Ideas, Thinkers, and Quotes | Philosophia",
            description=(
                "Explore Stoicism, Platonism, Aristotelianism, Existentialism, Rationalism, "
                "and Taoism through clear overviews, thinkers, and sourced quotes."
            ),
            eyebrow="Traditions and debates",
            heading="Schools of philosophy",
            lede=(
                "Use each school as a map, not a label. Read its history, meet related thinkers, "
                "and compare source-aware quotations across a shared tradition."
            ),
            cards="".join(school_cards),
            count_label=f"{len(SCHOOL_NAMES)} school hubs",
        ),
        encoding="utf-8",
    )

    topic_cards = []
    for topic_slug, topic in TOPICS.items():
        topic_quotes = [
            row for row in published if classify_topic(row["text"]) == topic_slug
        ]
        topic_quotes.sort(key=lambda candidate: (-candidate["likeCount"], candidate["author"]))
        article_html = f"""
          <div class="answer-box"><p>{esc(topic["lens"])}</p></div>
          <h2 id="read-theme">How to read quotes on this theme</h2>
          <p>Begin by identifying what the author means by the central term. Philosophers may use the same word for different questions, and a translation may conceal that difference. The source attached to each record is the route to the surrounding argument.</p>
          <ol>{''.join(f"<li>{esc(step)}</li>" for step in topic["steps"])}</ol>
          <h2 id="compare">Compare, do not merely collect</h2>
          <p>Save two passages that agree and one that resists them. Write down the disagreement in your own words. A useful thematic collection should make thought more precise, not simply make every author sound alike.</p>"""
        (SITE / "topics" / f"{topic_slug}.html").write_text(
            hub_page(
                section="topics",
                slug=topic_slug,
                title=f"{topic['name']} Philosophy Quotes With Sources | Philosophia",
                description=topic["description"],
                eyebrow="Philosophy topic",
                heading=f"Philosophy quotes about {topic['name'].lower()}",
                lede=topic["description"],
                article_html=article_html,
                quote_rows=topic_quotes,
                quote_slugs=slugs,
                published_date="2026-07-23",
            ),
            encoding="utf-8",
        )
        topic_cards.append(
            f"""<a class="library-card" href="{topic_slug}.html"><span>Topic</span><h2>{esc(topic["name"])}</h2><p>{esc(topic["description"])}</p><small>{len(topic_quotes)} published quotes →</small></a>"""
        )

    (SITE / "topics" / "index.html").write_text(
        collection_page(
            section="topics",
            title="Philosophy Quotes by Topic, With Sources | Philosophia",
            description=(
                "Browse source-aware philosophy quotes about resilience, self-knowledge, virtue, "
                "happiness, meaning, judgment, courage, and character."
            ),
            eyebrow="Questions that cross traditions",
            heading="Philosophy quote topics",
            lede=(
                "Compare how different thinkers approach the same human question, while keeping "
                "each quote connected to its author and catalog source."
            ),
            cards="".join(topic_cards),
            count_label=f"{len(TOPICS)} topic hubs",
        ),
        encoding="utf-8",
    )

    release_summary = {
        "generatedAt": requested_date.isoformat(),
        "publishedQuoteCount": len(published),
        "hubCount": len(INITIAL_AUTHORS) + len(WORKS) + len(SCHOOL_NAMES) + len(TOPICS),
        "quoteIds": [row["id"] for row in published],
        "quotePages": [f"quotes/{slugs[row['id']]}.html" for row in published],
        "manualBatchSize": manifest["monthlyBatchSize"],
        "catalogQuoteCount": len(rows),
    }
    (SITE / "assets" / "data").mkdir(parents=True, exist_ok=True)
    (SITE / "assets" / "data" / "quote-library.json").write_text(
        json.dumps(release_summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return len(published), release_summary["hubCount"]


def write_sitemap(today: date) -> int:
    canonical_pattern = re.compile(r'<link rel="canonical" href="([^"]+)"')
    urls = []
    for page in sorted(SITE.rglob("*.html")):
        match = canonical_pattern.search(page.read_text(encoding="utf-8"))
        if match:
            urls.append(match.group(1))
    entries = "\n".join(
        f"  <url><loc>{esc(url)}</loc><lastmod>{today.isoformat()}</lastmod></url>" for url in urls
    )
    sitemap = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{entries}\n"
        "</urlset>\n"
    )
    (SITE / "sitemap.xml").write_text(sitemap, encoding="utf-8")
    return len(urls)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--publish-due",
        metavar="YYYY-MM-DD",
        default=date.today().isoformat(),
        help="Generate every batch due on or before this date (default: today).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    requested_date = date.fromisoformat(args.publish_due)
    rows, philosophers, philosophies, author_school = read_data()
    quote_count, hub_count = generate(
        requested_date, rows, philosophers, philosophies, author_school
    )
    sitemap_count = write_sitemap(requested_date)
    print(
        f"Generated {quote_count} quote pages, {hub_count} editorial hubs, "
        f"5 collection indexes, and a {sitemap_count}-URL sitemap."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
