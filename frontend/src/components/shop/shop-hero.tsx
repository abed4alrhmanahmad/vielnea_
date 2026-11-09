import type { CSSProperties } from "react";
import shopHeroImg from "@/assets/vielinea-shop-hero.jpg";
import shopHeroWebp from "@/assets/vielinea-shop-hero.webp";

interface ShopHeroProps {
  /** Id of the element the "Explore Collection" button scrolls to. */
  targetId: string;
}

/**
 * Editorial hero for the shop page.
 *
 * The source image is ~16:9 with the model on the right third and plain wall
 * on the left, so every breakpoint uses an aspect ratio at or below 3/2 — all
 * well under the source. That way `object-cover` only ever trims the empty
 * left side: the figure is never cut off at the head or the feet, and the
 * image is never distorted. Below md the photo is a square above the text, so
 * the copy never covers the outfit; from md up the text overlays the wall.
 */
export function ShopHero({ targetId }: ShopHeroProps) {
  const scrollToProducts = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById(targetId);
    if (!el) return; // fall back to the plain hash link
    e.preventDefault();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  };

  return (
    <section className="bg-secondary/40" aria-label="Vielinea collection">
      <div className="container-luxe">
        {/* CSS entrances (same offsets, durations, delays and ease-out as the
            Framer Motion ones they replace): the JS-driven versions
            server-rendered this frame, and the LCP image in it, at opacity:0
            until the bundle had hydrated. See Shell. */}
        <div
          style={{ "--enter-from": "12px", "--enter-duration": "900ms" } as CSSProperties}
          className="enter-rise motion-reduce:animate-none relative isolate mx-auto flex w-full max-w-[1120px] flex-col overflow-hidden rounded-lg my-6 md:my-10 md:block md:aspect-[7/5] lg:aspect-[3/2]"
        >
          {/* This is the shop page's LCP. It is not resized per breakpoint on
              purpose: the frame is portrait on phones and `object-cover` then
              scales the 16:9 source by its height, so the image is drawn far
              wider than its container (~985px CSS at 412px of viewport) and a
              smaller file would visibly soften it. 1376px is the source's own
              resolution, so it is never upscaled either. The win here is the
              encoding — the same frame as WebP instead of baseline JPEG, which
              is 53KB rather than 123KB. The JPEG stays as the `<img>` fallback,
              so a browser without WebP still gets the same picture. */}
          <picture className="contents">
            <source type="image/webp" srcSet={shopHeroWebp} />
            <img
              src={shopHeroImg}
              alt="A model in a sage tailored blazer and dark denim standing in a sunlit Parisian apartment"
              width={1376}
              height={768}
              fetchPriority="high"
              decoding="async"
              className="relative aspect-square w-full object-cover object-[86%_center] md:absolute md:inset-0 md:aspect-auto md:size-full md:object-[62%_center] lg:object-center"
            />
          </picture>

          {/* Light scrim so the dark brand type stays readable over the photo,
              sweeping in from the left. Below md the text sits under the photo
              instead, so the model's outfit is never covered. */}
          <div className="absolute inset-0 hidden md:block md:bg-gradient-to-r md:from-background/92 md:from-0% md:via-background/55 md:via-35% md:to-transparent md:to-64%" />

          <div className="relative z-10 flex h-full flex-col justify-end md:justify-center bg-background/70 md:bg-transparent px-7 py-8 sm:px-9 md:px-12 lg:px-16 md:py-0 max-w-none md:max-w-[30rem] lg:max-w-[34rem]">
            <p
              style={{ "--enter-from": "12px", "--enter-duration": "700ms", "--enter-delay": "200ms" } as CSSProperties}
              className="enter-rise motion-reduce:animate-none text-[11px] md:text-xs uppercase tracking-[0.35em] text-primary"
            >
              The Autumn Edit
            </p>

            <h1
              style={{ "--enter-from": "16px", "--enter-duration": "700ms", "--enter-delay": "350ms" } as CSSProperties}
              className="enter-rise motion-reduce:animate-none font-display text-4xl md:text-5xl lg:text-6xl leading-[1.05] text-foreground mt-4 md:mt-5"
            >
              The Vielinea
              <br />
              Collection
            </h1>

            <p
              style={{ "--enter-from": "14px", "--enter-duration": "700ms", "--enter-delay": "500ms" } as CSSProperties}
              className="enter-rise motion-reduce:animate-none mt-5 md:mt-6 text-sm md:text-base text-foreground/80 leading-relaxed max-w-[26rem]"
            >
              Considered silhouettes, quiet detail and fabrics chosen to last — pieces made to be
              worn long after the season ends.
            </p>

            <div
              style={{ "--enter-from": "14px", "--enter-duration": "700ms", "--enter-delay": "650ms" } as CSSProperties}
              className="enter-rise motion-reduce:animate-none mt-8 md:mt-10"
            >
              <a
                href={`#${targetId}`}
                onClick={scrollToProducts}
                className="inline-flex items-center justify-center px-8 py-3 text-xs uppercase tracking-[0.25em] bg-primary text-primary-foreground hover:bg-primary-dark transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Explore Collection
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
