import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { useStore } from "@/contexts/store-context";
import { toast } from "sonner";
import { CheckoutDialog } from "@/components/shop/checkout-dialog";
import { IMAGE_SIZES, ResponsiveImage } from "@/components/responsive-image";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Shopping Bag — Vielinea" },
      { name: "description", content: "Review your Vielinea shopping bag." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const {
    cartItems,
    updateQuantity,
    removeFromCart,
    cartSubtotal,
    cartShipping,
    cartTotal,
    clearCart,
    user,
    isAuthenticated,
  } = useStore();
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // Subtotal, shipping and total are the API's figures whenever the shopper is
  // signed in; the guest preview uses the same rules the server applies.
  const shipping = cartShipping;
  const total = cartTotal;

  return (
    <Shell>
      <div className="container-luxe py-16">
        <h1 className="font-display text-4xl md:text-5xl text-center">Shopping Bag</h1>

        {cartItems.length === 0 ? (
          <div className="text-center py-24">
            <ShoppingBag className="size-12 mx-auto text-primary mb-4" />
            <p className="text-muted-foreground">Your bag is empty.</p>
            <Button asChild className="mt-6">
              <Link to="/shop">Discover the collection</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-12 grid lg:grid-cols-[1fr_360px] gap-10">
            <div className="space-y-4">
              {cartItems.map((item) => {
                const price = item.product.price * (1 - item.product.discount / 100);
                return (
                  <div
                    key={`${item.productId}-${item.size}`}
                    className="flex gap-4 bg-card border border-border p-4 rounded"
                  >
                    <Link
                      to="/product/$id"
                      params={{ id: item.productId }}
                      className="w-24 h-32 shrink-0 overflow-hidden bg-secondary rounded"
                    >
                      <ResponsiveImage
                        src={item.product.images[0]}
                        alt={item.product.title}
                        sizes={IMAGE_SIZES.lineItem}
                        className="size-full object-cover"
                      />
                    </Link>
                    <div className="flex-1">
                      <div className="flex justify-between gap-4">
                        <div>
                          <Link
                            to="/product/$id"
                            params={{ id: item.productId }}
                            className="font-display text-lg hover:text-primary"
                          >
                            {item.product.title}
                          </Link>
                          <p className="text-xs text-muted-foreground mt-1 uppercase tracking-widest">
                            Size: {item.size}
                          </p>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.productId, item.size)}
                          aria-label="Remove"
                          className="text-muted-foreground hover:text-primary"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <div className="inline-flex items-center border border-border">
                          <button
                            onClick={() =>
                              updateQuantity(item.productId, item.size, item.quantity - 1)
                            }
                            className="p-2 text-primary"
                            aria-label="Decrease"
                          >
                            <Minus className="size-3" />
                          </button>
                          <span className="w-8 text-center text-sm">{item.quantity}</span>
                          <button
                            onClick={() =>
                              updateQuantity(item.productId, item.size, item.quantity + 1)
                            }
                            className="p-2 text-primary"
                            aria-label="Increase"
                          >
                            <Plus className="size-3" />
                          </button>
                        </div>
                        <span className="text-primary font-medium">
                          ${(price * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="text-right">
                <button
                  onClick={clearCart}
                  className="text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-primary"
                >
                  Clear bag
                </button>
              </div>
            </div>

            <aside className="bg-card border border-border p-6 h-fit rounded">
              <h2 className="font-display text-2xl mb-6">Order Summary</h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt>Subtotal</dt>
                  <dd>${cartSubtotal.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Shipping</dt>
                  <dd>${shipping.toFixed(2)}</dd>
                </div>
                <div className="border-t border-border pt-3 flex justify-between text-base font-medium">
                  <dt>Total</dt>
                  <dd className="text-primary">${total.toFixed(2)}</dd>
                </div>
              </dl>

              <Button
                className="w-full mt-6 h-12 uppercase tracking-[0.2em] text-xs"
                onClick={() => {
                  if (!isAuthenticated) {
                    toast("Please sign in to complete your order");
                    return;
                  }
                  setCheckoutOpen(true);
                }}
              >
                Checkout
              </Button>
              {!isAuthenticated && (
                <p className="text-xs text-muted-foreground text-center mt-3">
                  <Link to="/login" className="text-primary underline underline-offset-4">
                    Sign in
                  </Link>{" "}
                  to check out — your bag will be waiting.
                </p>
              )}
              <p className="text-xs text-muted-foreground text-center mt-4">
                Secure checkout · Free returns
              </p>
            </aside>
          </div>
        )}
      </div>

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        defaultName={user?.name}
        defaultEmail={user?.email}
      />
    </Shell>
  );
}
