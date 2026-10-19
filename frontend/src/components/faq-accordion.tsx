import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useFaqs } from "@/services/faqs";

interface FaqAccordionProps {
  /** Spacing/width utilities for the surrounding page context. */
  className?: string;
}

/**
 * The shared FAQ list. Rendered on the /faq page and near the bottom of the
 * About page; both read the same entries from `GET /faqs`.
 *
 * Answers are plain text rendered as a text node, so React escapes them —
 * nothing an administrator types can inject markup.
 */
export function FaqAccordion({ className }: FaqAccordionProps) {
  const { enabled, faqs } = useFaqs();

  // Nothing at all when the admin has the section switched off, or when there
  // is no active question to show — no empty accordion left behind.
  if (!enabled || faqs.length === 0) return null;

  return (
    <Accordion type="single" collapsible className={className}>
      {faqs.map((f, i) => (
        <AccordionItem key={f.id} value={`item-${i}`} className="border-border">
          <AccordionTrigger className="text-left font-display text-lg text-foreground hover:text-primary">
            {f.question}
          </AccordionTrigger>
          <AccordionContent className="text-muted-foreground leading-relaxed">
            {f.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
