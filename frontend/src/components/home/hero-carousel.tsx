import { useEffect, useRef, useState } from "react";
import { useHeroSlides } from "@/services/hero-slides";

/** Autoplay dwell per slide. */
const INTERVAL_MS = 3000;
/** Slide transition. Kept in the 500–600ms band the design calls for. */
const TRANSITION_MS = 550;

/** Repeated on the frame and on every slide, so they stay the same height. */
const FRAME_HEIGHT = "min-h-[520px] md:min-h-[540px] lg:min-h-[620px]";

/**
 * The frame is far wider than the source photographs, so `object-fit: cover`
 * always discards a band of image height and the slide's `objectPosition`
 * decides which band. On mobile the crop is also pushed to 62% horizontally so
 * the subject stays clear of the text overlay — that shift predates the
 * carousel, so only the vertical half of the configured value carries over.
 *
 * CSS resolves a lone `top`/`bottom` as the vertical axis and a lone
 * percentage or `left`/`right` as the horizontal one; this mirrors that.
 */
function mobilePosition(value: string): string {
  const parts = value.trim().split(/\s+/);
  if (parts.length > 1) return `62% ${parts[1]}`;
  const only = (parts[0] ?? "").toLowerCase();
  return `62% ${only === "top" || only === "bottom" || only === "center" ? only : "center"}`;
}

/**
 * The homepage hero, as a carousel.
 *
 * Content comes entirely from `GET /hero-slides` — there is no slide list in
 * this file. The markup and classes per slide are the ones the static hero
 * already used, so the visual design is unchanged; only the number of slides
 * and the movement between them are new.
 *
 * Each slide is one flex child holding its own image, gradient and text, and
 * the whole track is translated. That is what guarantees an image can never be
 * shown against another slide's copy: they are the same element and move
 * together.
 *
 * Looping: a clone of the first slide is appended, so advancing past the last
 * slide keeps moving right-to-left like every other step rather than rewinding.
 * Once that transition ends, the track snaps back to the real first slide with
 * animation disabled — visually identical, so the seam is invisible.
 */
export function HeroCarousel() {
  const { data: slides = [] } = useHeroSlides();
  const count = slides.length;
  const loops = count > 1;

  // 0..count-1 are the real slides; `count` is the appended clone of slide 1.
  const [index, setIndex] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [paused, setPaused] = useState(false);
  // Bumped on a dot click so the autoplay timer restarts even when the click
  // targets the slide that is already showing.
  const [tick, setTick] = useState(0);
  // Whether the slides past the first have been given their `src` yet. Only
  // slide 1 is in the initial viewport, so the others wait — see `armed` below.
  const [armed, setArmed] = useState(false);
  // Slide 1's image, so its load state can be read on mount.
  const firstImg = useRef<HTMLImageElement | null>(null);

  // Autoplay. Re-created whenever the slide changes, which is what resets the
  // countdown after a manual jump.
  useEffect(() => {
    if (count <= 1 || paused) return;
    const id = window.setTimeout(() => setIndex((i) => i + 1), INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [index, tick, paused, count]);

  // Re-enable animation after a snap. The gap only has to outlast one paint;
  // the track is already in its final position, so nothing moves.
  useEffect(() => {
    if (animate) return;
    const id = window.setTimeout(() => setAnimate(true), 50);
    return () => window.clearTimeout(id);
  }, [animate]);

  // If the admin removes slides while a tab is open, keep the index in range.
  useEffect(() => {
    if (count > 0 && index > count) setIndex(0);
  }, [count, index]);

  /**
   * Arming the later slides is driven by slide 1 finishing, not by a timer: on a
   * throttled connection the LCP image can take several seconds, and any fixed
   * delay short enough to be useful would fire while it is still in flight —
   * putting back exactly the contention this is meant to remove.
   *
   * `onLoad` carries that signal, except for an image the server-rendered markup
   * had already finished loading before React attached the handler, in which case
   * the event never fires. Reading `complete` once on mount covers that case
   * deterministically, which is what makes the timer unnecessary.
   */
  useEffect(() => {
    if (count <= 1 || armed) return;
    if (firstImg.current?.complete) setArmed(true);
  }, [count, armed]);

  // Whatever is about to be shown needs its `src` now. This covers autoplay
  // reaching slide 2 before slide 1 has loaded — a slow connection where the
  // carousel would have been mid-transition on a part-loaded image anyway.
  useEffect(() => {
    if (index !== 0) setArmed(true);
  }, [index]);

  if (count === 0) return null;

  const track = loops ? [...slides, slides[0]!] : slides;
  const activeDot = index % count;
  const firstUrl = slides[0]!.imageUrl;

  const goTo = (i: number) => {
    // A dot click can land before slide 1 has loaded, so make the jump safe:
    // whatever the visitor is about to see must already have its `src`.
    setArmed(true);
    setIndex(i);
    setTick((t) => t + 1);
  };

  return (
    <section className="relative overflow-hidden bg-secondary/60">
      <div className="container-luxe">
        <div
          style={{ "--enter-from": "10px", "--enter-duration": "900ms" } as React.CSSProperties}
          className={`enter-rise motion-reduce:animate-none relative ${FRAME_HEIGHT} overflow-hidden rounded-lg my-6 md:my-10`}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div
            className={`flex ${FRAME_HEIGHT} h-full`}
            style={{
              transform: `translateX(-${index * 100}%)`,
              transition: animate ? `transform ${TRANSITION_MS}ms ease-in-out` : "none",
            }}
            onTransitionEnd={(e) => {
              // Only the track's own transform, not a bubbled child transition.
              if (e.target !== e.currentTarget || e.propertyName !== "transform") return;
              if (loops && index === count) {
                setAnimate(false);
                setIndex(0);
              }
            }}
          >
            {track.map((slide, i) => {
              const headingLines = slide.heading.split(/\n|<br\s*\/?\s*>/i);
              // Only the first slide carries the page's h1; the rest (and the
              // clone) are h2 with identical classes, so the page keeps exactly
              // one h1 while looking the same.
              const Heading = i === 0 ? "h1" : "h2";
              return (
                <div
                  key={`${slide.id}-${i}`}
                  className={`relative w-full shrink-0 ${FRAME_HEIGHT}`}
                  aria-hidden={i !== index}
                >
                  {/* Background image — shifted right on mobile so text sits on
                      the plain wall; the crop's focal point is per-slide. */}
                  <img
                    // Only the slide in the initial viewport is fetched with the
                    // page; the rest get their `src` once slide 1 has loaded, so
                    // the LCP image is not sharing bandwidth with ~240KB of
                    // imagery nobody can see yet. `loading="lazy"` would not do
                    // this — the whole frame is in the viewport, so the later
                    // slides count as visible and would load anyway.
                    //
                    // Withholding the attribute rather than lazy-loading also
                    // keeps the guarantee that matters: by the time a slide can
                    // be shown it has had seconds to load, so no slide is ever
                    // blank mid-transition. The appended clone shares slide 1's
                    // URL, which is why matching on the URL arms it for free.
                    src={armed || slide.imageUrl === firstUrl ? slide.imageUrl : undefined}
                    alt={slide.heading.replace(/\n/g, " ")}
                    // The first slide is the LCP element, so it is fetched at high
                    // priority; the others at low, so that even once armed they
                    // queue behind anything still needed for the first paint.
                    fetchPriority={i === 0 ? "high" : "low"}
                    loading="eager"
                    decoding={i === 0 ? "sync" : "async"}
                    // Slide 1 finishing is the cue to fetch the rest.
                    {...(i === 0
                      ? {
                          ref: firstImg,
                          onLoad: () => setArmed(true),
                          onError: () => setArmed(true),
                        }
                      : {})}
                    style={
                      {
                        "--hero-pos": slide.objectPosition,
                        "--hero-pos-mobile": mobilePosition(slide.objectPosition),
                      } as React.CSSProperties
                    }
                    className="absolute inset-0 size-full object-cover [object-position:var(--hero-pos-mobile)] md:[object-position:var(--hero-pos)]"
                  />

                  {/* Subtle left-side gradient for text legibility */}
                  <div className="absolute inset-0 bg-gradient-to-r from-secondary/85 via-secondary/40 to-transparent md:from-secondary/70 md:via-secondary/25 md:to-transparent" />

                  {/* Text overlay */}
                  <div
                    className={`relative z-10 flex flex-col justify-center h-full ${FRAME_HEIGHT} px-8 md:px-14 lg:px-20 py-16 md:py-0 max-w-xl`}
                  >
                    <p
                      style={
                        { "--enter-from": "12px", "--enter-delay": "200ms" } as React.CSSProperties
                      }
                      className="enter-rise motion-reduce:animate-none text-[11px] md:text-xs uppercase tracking-[0.35em] text-foreground mb-4 md:mb-5"
                    >
                      {slide.eyebrowText}
                    </p>
                    <Heading
                      style={
                        { "--enter-from": "16px", "--enter-delay": "350ms" } as React.CSSProperties
                      }
                      className="enter-rise motion-reduce:animate-none font-display text-4xl md:text-5xl lg:text-6xl leading-[1.05] text-foreground drop-shadow-sm"
                    >
                      {headingLines.map((line, li) => (
                        <span key={li}>
                          {line}
                          {li < headingLines.length - 1 && <br />}
                        </span>
                      ))}
                    </Heading>
                    <p
                      style={
                        { "--enter-from": "14px", "--enter-delay": "500ms" } as React.CSSProperties
                      }
                      className="enter-rise motion-reduce:animate-none mt-5 md:mt-6 text-sm md:text-base text-foreground max-w-[280px] leading-relaxed"
                    >
                      {slide.description}
                    </p>
                    <div
                      style={
                        { "--enter-from": "14px", "--enter-delay": "650ms" } as React.CSSProperties
                      }
                      className="enter-rise motion-reduce:animate-none mt-8 md:mt-10"
                    >
                      <a
                        href={slide.buttonLink || "/shop"}
                        className="inline-flex items-center justify-center px-8 py-3 text-xs uppercase tracking-[0.25em] bg-primary text-primary-foreground hover:bg-primary-dark transition-colors rounded-sm"
                      >
                        {slide.buttonText}
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Carousel dots — one per slide, the active one filled. */}
          <div className="absolute bottom-5 left-8 md:left-14 lg:left-20 z-10 flex items-center gap-2">
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Show slide ${i + 1}`}
                aria-current={activeDot === i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  activeDot === i ? "bg-primary" : "bg-foreground/30"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
