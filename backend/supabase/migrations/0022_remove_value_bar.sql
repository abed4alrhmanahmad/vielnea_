-- ---------------------------------------------------------------------------
-- 0022 — Remove the homepage value bar.
--
-- The Easy Returns / Secure Payment / 24/7 Support tiles are gone from the
-- homepage. "Secure Payment" now lives in the site footer, hardcoded in
-- footer.tsx, so nothing reads this row any more.
--
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

DELETE FROM public.site_sections
 WHERE section_key = 'value_bar';
