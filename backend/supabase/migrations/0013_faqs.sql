-- ===========================================================================
-- Vielinea — admin-managed FAQ
-- ---------------------------------------------------------------------------
-- Moves the FAQ out of the frontend's `@/data/faqs` module and into the
-- database, without changing a word of what the site currently shows.
--
-- Three pieces, following the company-timeline precedent exactly:
--
--   1. `faqs` — the questions and answers.
--   2. A `faq` page in `site_pages` — the FAQ is a real page (/faq), so it
--      gets a page record like home/about/contact rather than borrowing one.
--   3. A `faq` row in `site_sections` on that page — the section-level on/off
--      switch, plus the eyebrow / heading / description copy.
--
-- The switch reuses the CMS: `GET /site/pages/:slug` already filters out
-- sections whose `is_visible` is false, and `PUT /admin/site/sections/:id`
-- already toggles it. Switching the FAQ off hides it on BOTH pages that render
-- it (/faq and the About page) while every row in `faqs` stays put.
--
-- Individual entries have their own `is_active`, which hides one question
-- rather than the whole section.
--
-- Safe to run repeatedly: every statement is IF NOT EXISTS / ON CONFLICT, and
-- each seed only fires when its table is empty. No DROP TABLE, no DELETE.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- faqs
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.faqs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question      text NOT NULL CHECK (length(btrim(question)) > 0),
  -- Plain text. The project has no rich-text editor, and the accordion renders
  -- this as a text node, so it is escaped by React and safe by construction.
  answer        text NOT NULL DEFAULT '',
  display_order integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Serves the public read: active questions in display order.
CREATE INDEX IF NOT EXISTS faqs_active_order_idx
  ON public.faqs (is_active, display_order, created_at);

-- Serves the admin read: every question, in display order.
CREATE INDEX IF NOT EXISTS faqs_order_idx
  ON public.faqs (display_order, created_at);

DROP TRIGGER IF EXISTS faqs_set_updated_at ON public.faqs;
CREATE TRIGGER faqs_set_updated_at
  BEFORE UPDATE ON public.faqs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- Row Level Security: deny-by-default for the public API keys, matching every
-- other table. No policies, so anon/authenticated can reach nothing; the API
-- connects as a privileged role which bypasses RLS.
-- --------------------------------------------------------------------------
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- The /faq page record. Its SEO columns mirror the meta tags the route
-- already declares, so nothing about the page changes.
-- --------------------------------------------------------------------------
INSERT INTO public.site_pages
  (slug, title, meta_title, meta_description, og_title, og_description, is_published)
VALUES (
  'faq',
  'FAQ',
  'FAQ — Vielinea',
  'Answers to common questions about Vielinea orders, shipping, returns, sizing and care.',
  'FAQ — Vielinea',
  'Everything you need to know about shopping with Vielinea.',
  true
)
ON CONFLICT (slug) DO NOTHING;

-- --------------------------------------------------------------------------
-- The section switch + header copy, seeded with exactly the text the pages
-- render today: eyebrow "Support", heading "Frequently Asked Questions", and
-- the lead sentence from the /faq page.
-- --------------------------------------------------------------------------
INSERT INTO public.site_sections
  (page_id, section_key, section_type, subtitle, title, content, display_order, is_visible)
SELECT p.id, 'faq', 'faq',
       'Support',
       'Frequently Asked Questions',
       'Everything you need to know about shopping with Vielinea.',
       0, true
FROM public.site_pages p
WHERE p.slug = 'faq'
ON CONFLICT (page_id, section_key) DO NOTHING;

-- --------------------------------------------------------------------------
-- Seed — the eight questions the site already shows, copied verbatim from
-- frontend/src/data/faqs.ts so the public FAQ is unchanged after this runs.
-- Guarded on the table being empty, so admin edits and deletions are never
-- resurrected.
-- --------------------------------------------------------------------------
INSERT INTO public.faqs (question, answer, display_order, is_active)
SELECT *
FROM (
  VALUES
    (
      'How long does shipping take?',
      'Standard orders arrive within 3–5 business days. Express delivery is available at checkout and typically arrives within 1–2 business days. International orders take 7–14 business days.',
      1, true
    ),
    (
      'What is your return policy?',
      'We offer 30-day returns on unworn items in original condition with tags attached. Sale and personalized pieces are final sale.',
      3, true
    ),
    (
      'How do I know my size?',
      'Each product page includes a detailed size guide with measurements. If you''re between sizes, we recommend sizing up for a relaxed fit.',
      4, true
    ),
    (
      'How should I care for my Vielinea pieces?',
      'Most pieces are dry-clean recommended to preserve fabric quality. Care instructions are printed on the garment label and detailed on each product page.',
      5, true
    ),
    (
      'Can I modify or cancel my order?',
      'Orders can be modified or cancelled within 2 hours of purchase. Please contact us immediately at hello@vielinea.com.',
      6, true
    ),
    (
      'Do you ship internationally?',
      'Yes — we ship to over 60 countries worldwide. Duties and taxes may apply at delivery depending on your location.',
      7, true
    ),
    (
      'Are your materials sustainably sourced?',
      'We work exclusively with mills and ateliers that meet our standards for ethical production and traceable materials. Learn more on our About page.',
      8, true
    )
) AS seed (question, answer, display_order, is_active)
WHERE NOT EXISTS (SELECT 1 FROM public.faqs);
