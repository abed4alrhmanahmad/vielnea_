/**
 * CMS seed — a verbatim transcription of the content currently hardcoded in
 * the frontend.
 *
 * Nothing here is invented. Every string is copied from the component or
 * service it currently lives in, so that after the CMS goes live the site
 * renders byte-identically and the change is invisible to customers.
 *
 * Sources:
 *   header.tsx                    -> nav
 *   footer.tsx                    -> footer columns, legal line
 *   about.tsx                     -> about page sections
 *   contact.tsx                   -> contact page copy
 *   index.tsx                     -> hero, value bar, section headings, instagram
 *   admin/services/site-content.ts -> announcement, hero copy, footer tagline,
 *                                     contact details, newsletter, social
 *   data/products.ts              -> testimonials
 */

export interface SeedSection {
  sectionKey: string;
  sectionType: string;
  title?: string | null;
  subtitle?: string | null;
  content?: string | null;
  imageUrl?: string | null;
  buttonText?: string | null;
  buttonUrl?: string | null;
  displayOrder: number;
  isVisible?: boolean;
  settings?: Record<string, unknown>;
}

export interface SeedPage {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  sections: SeedSection[];
}

/** The hero image already shipped with the site. */
const HERO_IMAGE = "/images/brand/vielinea-hero.jpg";

// ---------------------------------------------------------------------------
// Settings groups (stored in site_content as key -> jsonb)
// ---------------------------------------------------------------------------
export const seedSettings: Record<string, unknown> = {
  announcement: {
    enabled: false,
    text: "",
  },

  // header.tsx `nav`
  header: {
    nav: [
      { label: "Home", href: "/", enabled: true },
      { label: "Shop", href: "/shop", enabled: true },
      { label: "Gifts", href: "/shop?gift=1", enabled: true },
      // Accessories are their own entity and their own page, not a product category.
      { label: "Accessories", href: "/accessories", enabled: true },
      { label: "About", href: "/about", enabled: true },
      { label: "FAQ", href: "/faq", enabled: true },
      { label: "Contact", href: "/contact", enabled: true },
    ],
  },

  // footer.tsx columns + site-content.ts tagline/copyright
  footer: {
    tagline: "Timeless pieces made for the modern woman. Elegance, without excess.",
    copyright: `© ${new Date().getFullYear()} Vielinea. All rights reserved.`,
    legal: "Privacy · Terms · Shipping",
    columns: [
      {
        heading: "Shop",
        links: [
          { label: "Dresses", href: "/shop?cat=dresses" },
          { label: "Blouses", href: "/shop?cat=blouses" },
          { label: "Handbags", href: "/shop?cat=handbags" },
          { label: "Jewelry", href: "/shop?cat=jewelry" },
        ],
      },
      {
        heading: "Company",
        links: [
          { label: "About Us", href: "/about" },
          { label: "Contact", href: "/contact" },
          { label: "FAQ", href: "/faq" },
          { label: "Careers", href: "#" },
          { label: "Journal", href: "#" },
        ],
      },
    ],
  },

  social: {
    instagram: "#",
    facebook: "#",
    twitter: "#",
  },

  contact: {
    email: "hello@vielinea.com",
    phone: "+1 (555) 010-2200",
    address: "12 Rue Saint-Honoré, Paris",
    hours: "Monday to Friday, 9am – 6pm CET",
  },

  newsletter: {
    title: "Join the Vielinea circle",
    body: "Early access, private previews and 10% off your first order.",
    buttonText: "Subscribe",
    enabled: true,
  },
};

// ---------------------------------------------------------------------------
// Testimonials — data/products.ts
// ---------------------------------------------------------------------------
export const seedTestimonials = [
  {
    name: "Isabelle Moreau",
    location: "Paris",
    quote:
      "Vielinea captures a rare kind of restraint. Every piece feels considered — the fabrics, the fit, the finish.",
    sortOrder: 0,
  },
  {
    name: "Amélie Chen",
    location: "New York",
    quote:
      "I've replaced half my wardrobe with Vielinea. The linen dresses feel like heirlooms already.",
    sortOrder: 1,
  },
  {
    name: "Sofia Rinaldi",
    location: "Milan",
    quote: "Effortless, elegant and unfussy. This is quiet luxury done properly.",
    sortOrder: 2,
  },
];

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------
export const seedPages: SeedPage[] = [
  {
    slug: "home",
    title: "Home",
    metaTitle: "Vielinea — Timeless Luxury for the Modern Woman",
    metaDescription:
      "Discover Vielinea's collection of elegant dresses, blouses, handbags and jewelry — timeless luxury made for everyday.",
    ogTitle: "Vielinea — Timeless Luxury",
    ogDescription: "Timeless luxury for the modern woman.",
    sections: [
      {
        sectionKey: "hero",
        sectionType: "hero",
        title: "Timeless\nElegance",
        subtitle: "New Collection",
        content: "Discover our latest collection made for modern women.",
        imageUrl: HERO_IMAGE,
        buttonText: "Shop Now",
        buttonUrl: "/shop",
        displayOrder: 0,
      },
      {
        // index.tsx value bar
        sectionKey: "value_bar",
        sectionType: "value_bar",
        displayOrder: 1,
        settings: {
          items: [
            { icon: "RotateCcw", title: "Easy Returns", sub: "30-day return policy" },
            { icon: "ShieldCheck", title: "Secure Payment", sub: "100% protected" },
            { icon: "HeadphonesIcon", title: "24/7 Support", sub: "We're here to help" },
          ],
        },
      },
      {
        sectionKey: "featured_categories",
        sectionType: "featured_categories",
        title: "",
        displayOrder: 2,
        settings: {
          categories: ["blazers", "vests", "accessories"],
          labels: {},
          // Accessories has its own page rather than a shop filter.
          hrefs: { accessories: "/accessories" },
        },
      },
      {
        sectionKey: "new_arrivals",
        sectionType: "product_row",
        title: "New Arrivals",
        displayOrder: 3,
        settings: { source: "newArrival", limit: 4, productIds: [] },
      },
      {
        sectionKey: "best_sellers",
        sectionType: "product_row",
        title: "Best Sellers",
        displayOrder: 4,
        settings: { source: "bestSeller", limit: 4, productIds: [] },
      },
      {
        sectionKey: "gifts",
        sectionType: "product_row",
        title: "Clothes with Gifts",
        displayOrder: 5,
        settings: { source: "gift", limit: 4, productIds: [], linkSearch: { gift: "1" } },
      },
      {
        sectionKey: "featured",
        sectionType: "product_row",
        title: "Featured",
        displayOrder: 6,
        isVisible: false,
        settings: { source: "featured", limit: 4, productIds: [] },
      },
      {
        sectionKey: "accessories",
        sectionType: "product_row",
        title: "Accessories",
        displayOrder: 7,
        isVisible: false,
        settings: { source: "category", category: "accessories", limit: 4, productIds: [] },
      },
      {
        sectionKey: "testimonials",
        sectionType: "testimonials",
        title: "Wearing Vielinea",
        subtitle: "Praise",
        displayOrder: 8,
      },
      {
        sectionKey: "instagram",
        sectionType: "instagram",
        title: "@vielinea",
        subtitle: "Follow",
        buttonText: "View Instagram",
        buttonUrl: "#",
        displayOrder: 9,
        settings: { count: 6 },
      },
      {
        sectionKey: "newsletter",
        sectionType: "newsletter",
        title: "Join the Vielinea circle",
        content: "Early access, private previews and 10% off your first order.",
        buttonText: "Subscribe",
        displayOrder: 10,
      },
    ],
  },

  {
    slug: "about",
    title: "About Vielinea",
    metaTitle: "About Vielinea — Timeless Luxury Fashion",
    metaDescription:
      "The Vielinea story: quiet luxury, considered craft, and pieces designed to endure.",
    ogTitle: "About Vielinea",
    ogDescription: "Quiet luxury, considered craft, made to endure.",
    sections: [
      {
        sectionKey: "intro",
        sectionType: "rich_text",
        subtitle: "Our Story",
        title: "About Vielinea",
        content:
          "Vielinea crafts timeless luxury fashion — dresses, blouses, handbags and jewelry made for the modern woman.",
        imageUrl: HERO_IMAGE,
        displayOrder: 0,
      },
      {
        sectionKey: "mission",
        sectionType: "value_card",
        title: "Mission",
        content:
          "To make timeless clothing that respects the woman who wears it and the hands that made it.",
        displayOrder: 1,
        settings: { icon: "Sparkles" },
      },
      {
        sectionKey: "vision",
        sectionType: "value_card",
        title: "Vision",
        content: "A wardrobe of fewer, better pieces — a quiet answer to fast fashion.",
        displayOrder: 2,
        settings: { icon: "Leaf" },
      },
      {
        sectionKey: "values",
        sectionType: "value_card",
        title: "Values",
        content: "Considered materials, small-batch production, and honest craftsmanship.",
        displayOrder: 3,
        settings: { icon: "Award" },
      },
      {
        sectionKey: "craft",
        sectionType: "rich_text",
        subtitle: "Made With Care",
        title: "Designed in Paris. Crafted in Portugal.",
        content:
          "Every Vielinea piece begins as a sketch in our Paris studio and ends in the hands of a small team of artisans in northern Portugal. Along the way we make choices — about fibre, about finish, about pace — that reflect who we are.",
        displayOrder: 4,
      },
    ],
  },

  {
    slug: "contact",
    title: "Contact",
    metaTitle: "Contact — Vielinea",
    metaDescription: "Get in touch with the Vielinea client care team.",
    ogTitle: "Contact Vielinea",
    ogDescription: "Talk to our client care team.",
    sections: [
      {
        sectionKey: "intro",
        sectionType: "rich_text",
        subtitle: "Client Care",
        title: "Get in touch",
        content:
          "We'd love to hear from you. Reach out with any question about a piece, an order or a private appointment.",
        displayOrder: 0,
      },
      {
        sectionKey: "map",
        sectionType: "map",
        title: "Map placeholder",
        displayOrder: 1,
        settings: { embedUrl: "" },
      },
    ],
  },
];
