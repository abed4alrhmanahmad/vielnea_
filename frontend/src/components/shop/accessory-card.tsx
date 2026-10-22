/**
 * Accessory card and detail dialog, shared by /accessories and the homepage
 * Accessories row so both show the same image, name, price and sold-out state.
 */
import { motion } from "framer-motion";
import { IMAGE_SIZES, ResponsiveImage } from "@/components/responsive-image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ApiAccessory } from "@/lib/api/types";

export function AccessoryCard({
  accessory,
  onOpen,
}: {
  accessory: ApiAccessory;
  onOpen: () => void;
}) {
  const soldOut = accessory.stock <= 0;

  return (
    <motion.article whileHover={{ y: -4 }} transition={{ duration: 0.3 }} className="group">
      <button
        type="button"
        onClick={onOpen}
        className="relative block w-full aspect-[3/4] overflow-hidden bg-secondary rounded-md text-left"
      >
        {accessory.images[0] ? (
          <ResponsiveImage
            src={accessory.images[0]}
            alt={accessory.name}
            sizes={IMAGE_SIZES.card}
            loading="lazy"
            className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Vielinea
          </span>
        )}
        <div className="absolute top-3 left-3 flex flex-col gap-1">
          {accessory.discount > 0 && (
            <span className="bg-foreground text-background text-[10px] uppercase tracking-widest px-2 py-1">
              -{accessory.discount}%
            </span>
          )}
          {soldOut && (
            <span className="order-first bg-foreground text-background text-[10px] font-medium uppercase tracking-widest px-2 py-1">
              Sold out
            </span>
          )}
        </div>
      </button>
      <div className="pt-4 space-y-1">
        <button
          type="button"
          onClick={onOpen}
          className="block text-left font-display text-base text-foreground hover:text-primary"
        >
          {accessory.name}
        </button>
        <div className="flex items-baseline gap-2 text-sm">
          <span className="text-primary font-medium">${accessory.finalPrice.toFixed(0)}</span>
          {accessory.discount > 0 && (
            <span className="text-muted-foreground line-through text-xs">${accessory.price}</span>
          )}
        </div>
      </div>
    </motion.article>
  );
}

/** Full detail for one accessory, including every image the admin uploaded. */
export function AccessoryDialog({
  accessory,
  onClose,
}: {
  accessory: ApiAccessory | null;
  onClose: () => void;
}) {
  if (!accessory) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{accessory.name}</DialogTitle>
          <DialogDescription className="text-xs uppercase tracking-[0.2em]">
            Complementary accessory
          </DialogDescription>
        </DialogHeader>

        {accessory.images.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {accessory.images.map((src, i) => (
              <ResponsiveImage
                key={i}
                src={src}
                alt={`${accessory.name} — view ${i + 1}`}
                // The dialog is capped at max-w-2xl (672px) less its padding:
                // the lead image spans both columns, the rest sit in one.
                sizes={
                  i === 0
                    ? "min(624px, calc(100vw - 48px))"
                    : "min(306px, calc((100vw - 60px) / 2))"
                }
                loading="lazy"
                className={`w-full object-cover rounded-md ${i === 0 ? "col-span-2 aspect-[4/3]" : "aspect-square"}`}
              />
            ))}
          </div>
        )}

        <div className="flex items-baseline gap-3">
          <span className="text-primary text-xl font-medium">
            ${accessory.finalPrice.toFixed(2)}
          </span>
          {accessory.discount > 0 && (
            <span className="text-muted-foreground line-through text-sm">
              ${accessory.price.toFixed(2)}
            </span>
          )}
          <span className="ml-auto text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {/* Availability only — the exact count stays in the admin dashboard. */}
            {accessory.stock > 0 ? "Available" : "Sold out"}
          </span>
        </div>

        {accessory.description && (
          <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
            {accessory.description}
          </p>
        )}

        <p className="text-xs text-muted-foreground border-t border-border pt-4">
          Accessories are complementary pieces. Mention the one you would like in your order notes
          at checkout, or ask us through live chat and we will add it to your order.
        </p>
      </DialogContent>
    </Dialog>
  );
}
