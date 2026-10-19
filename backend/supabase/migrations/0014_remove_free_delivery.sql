-- ---------------------------------------------------------------------------
-- 0014 — Remove the free-delivery feature.
--
-- Shipping itself is unchanged: every order is charged store_settings
-- .standard_shipping. What goes away is the "free over a threshold" rule and
-- the customer-facing copy that promised it.
--
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

-- 1. The threshold column is no longer read by any code. Leaving it in place
--    would let an admin set a value that silently does nothing.
ALTER TABLE public.store_settings
  DROP COLUMN IF EXISTS free_shipping_threshold;

-- 2. The FAQ entry that advertised it.
DELETE FROM public.faqs
 WHERE question = 'Do you offer free shipping?';

-- 3. The "Free Shipping / On orders over $100" tile in the home value bar.
--    The other three tiles are left exactly as they are.
UPDATE public.site_sections
   SET settings = jsonb_set(
         settings,
         '{items}',
         COALESCE(
           (SELECT jsonb_agg(item ORDER BY ord)
              FROM jsonb_array_elements(settings -> 'items')
                   WITH ORDINALITY AS t(item, ord)
             WHERE item ->> 'title' <> 'Free Shipping'),
           '[]'::jsonb
         )
       )
 WHERE section_key = 'value_bar'
   AND settings ? 'items'
   AND settings -> 'items' @> '[{"title": "Free Shipping"}]'::jsonb;

-- 4. The announcement bar. Its only content was the free-shipping promise, so
--    the bar is switched off and emptied rather than left contradicting the
--    checkout. The bar itself still works — an admin can set new text and
--    re-enable it from /admin/content. Guarded on the text so a replacement
--    announcement written later is never touched.
UPDATE public.site_content
   SET value = jsonb_build_object('enabled', false, 'text', '')
 WHERE key = 'announcement'
   AND value ->> 'text' ILIKE '%shipping%';
