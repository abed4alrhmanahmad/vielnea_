/**
 * Cart, wishlist and auth state for the storefront.
 *
 * Data comes from the Express API. Signed-in shoppers get server-backed carts
 * and wishlists persisted in Supabase; guests keep browsing with a localStorage
 * cart, which is merged into their account the moment they sign in.
 *
 * The context's public shape is unchanged from the previous mock implementation,
 * so presentational components consume it exactly as before.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Product } from "@/data/products";
import { ApiError, apiClient, errorMessage, getToken, setToken } from "@/lib/api/client";
import { toStoreProduct, type StoreProduct } from "@/lib/api/mappers";
import type {
  ApiAuthResult,
  ApiCartSummary,
  ApiProduct,
  ApiUser,
  ApiWishlistItem,
} from "@/lib/api/types";

export interface CartItem {
  productId: string;
  size: string;
  quantity: number;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role?: "customer" | "admin";
}

interface StoreContextValue {
  cart: CartItem[];
  wishlist: string[];
  user: AuthUser | null;
  addToCart: (productId: string, size: string, quantity?: number) => void;
  removeFromCart: (productId: string, size: string) => void;
  updateQuantity: (productId: string, size: string, quantity: number) => void;
  clearCart: () => void;
  toggleWishlist: (productId: string) => void;
  isWishlisted: (productId: string) => boolean;
  moveWishlistToCart: (productId: string) => void;
  login: (email: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  cartCount: number;
  cartSubtotal: number;
  cartItems: Array<CartItem & { product: Product }>;
  wishlistItems: Product[];
  // --- additions used by the cart page to show server-authoritative totals ---
  isAuthenticated: boolean;
  authReady: boolean;
  cartShipping: number;
  cartTotal: number;
  cartDiscount: number;
  refreshCart: () => void;
  /** True while the signed-in shopper's wishlist is still being fetched. */
  wishlistLoading: boolean;
  /**
   * A token is present but the session could not be verified — the API is
   * unreachable or erroring. Distinct from being signed out.
   */
  authUnavailable: boolean;
  /** Re-attempts session verification after `authUnavailable`. */
  retryAuth: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const STORAGE = { cart: "v_cart", wishlist: "v_wishlist" };

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable — state stays in memory for this session.
  }
}

function toAuthUser(user: ApiUser): AuthUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [hydrated, setHydrated] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  // Guest state — only used while signed out.
  const [guestCart, setGuestCart] = useState<CartItem[]>([]);
  const [guestWishlist, setGuestWishlist] = useState<string[]>([]);

  useEffect(() => {
    setGuestCart(loadJSON<CartItem[]>(STORAGE.cart, []));
    setGuestWishlist(loadJSON<string[]>(STORAGE.wishlist, []));
    setHasToken(Boolean(getToken()));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveJSON(STORAGE.cart, guestCart);
  }, [guestCart, hydrated]);

  useEffect(() => {
    if (hydrated) saveJSON(STORAGE.wishlist, guestWishlist);
  }, [guestWishlist, hydrated]);

  // --- current user ---------------------------------------------------------
  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => apiClient.get<{ user: ApiUser }>("/auth/me"),
    enabled: hydrated && hasToken,
    // A rejected token will never succeed, so do not retry it. A network blip
    // or a 5xx is worth one more attempt before the UI gives up.
    retry: (attempt, error) =>
      attempt < 2 && !(error instanceof ApiError && error.isUnauthorized),
    staleTime: 5 * 60_000,
  });

  /**
   * True when a token is present but the session could not be verified for a
   * reason that says nothing about the token — the API being unreachable, or
   * a 5xx. The shopper is not signed out for that; the UI offers a retry.
   */
  const authUnavailable =
    meQuery.isError && !(meQuery.error instanceof ApiError && meQuery.error.isUnauthorized);

  // Only a *rejected* token is stale. Clearing it on any error would sign a
  // customer out because the server hiccuped, losing their session for good.
  useEffect(() => {
    if (meQuery.isError && !authUnavailable) {
      setToken(null);
      setHasToken(false);
    }
  }, [meQuery.isError, authUnavailable]);

  const retryAuth = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
  }, [queryClient]);

  const user = meQuery.data?.user ? toAuthUser(meQuery.data.user) : null;
  const isAuthenticated = Boolean(user);
  const authReady = hydrated && (!hasToken || !meQuery.isPending);

  // --- catalogue lookup, for resolving guest cart/wishlist lines -----------
  // The catalogue is small, so one request keeps guest state fully rendered
  // without a round trip per line.
  const needsCatalogue =
    hydrated && !isAuthenticated && (guestCart.length > 0 || guestWishlist.length > 0);

  const catalogueQuery = useQuery({
    queryKey: ["products", "catalogue"],
    queryFn: async () => apiClient.get<ApiProduct[]>("/products", { params: { limit: 60 } }),
    enabled: needsCatalogue,
    staleTime: 5 * 60_000,
  });

  const catalogue = useMemo(() => {
    const map = new Map<string, StoreProduct>();
    for (const item of catalogueQuery.data ?? []) {
      const product = toStoreProduct(item);
      map.set(product.slug, product);
    }
    return map;
  }, [catalogueQuery.data]);

  // --- server cart + wishlist ----------------------------------------------
  const cartQuery = useQuery({
    queryKey: ["cart"],
    queryFn: async () => apiClient.get<ApiCartSummary>("/cart"),
    enabled: isAuthenticated,
    staleTime: 10_000,
  });

  const wishlistQuery = useQuery({
    queryKey: ["wishlist"],
    queryFn: async () => apiClient.get<ApiWishlistItem[]>("/wishlist"),
    enabled: isAuthenticated,
    staleTime: 10_000,
  });

  const invalidateCart = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["cart"] });
  }, [queryClient]);

  const invalidateWishlist = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["wishlist"] });
  }, [queryClient]);

  // --- derived collections -------------------------------------------------
  const serverCart = cartQuery.data;

  const cartItems = useMemo<Array<CartItem & { product: Product }>>(() => {
    if (isAuthenticated) {
      return (serverCart?.items ?? []).map((item) => ({
        productId: item.product.slug,
        size: item.size,
        quantity: item.quantity,
        product: toStoreProduct(item.product),
      }));
    }
    return guestCart.flatMap((line) => {
      const product = catalogue.get(line.productId);
      return product ? [{ ...line, product }] : [];
    });
  }, [isAuthenticated, serverCart, guestCart, catalogue]);

  const wishlistIds = useMemo<string[]>(
    () =>
      isAuthenticated ? (wishlistQuery.data ?? []).map((item) => item.product.slug) : guestWishlist,
    [isAuthenticated, wishlistQuery.data, guestWishlist],
  );

  const wishlistItems = useMemo<Product[]>(() => {
    if (isAuthenticated) {
      return (wishlistQuery.data ?? []).map((item) => toStoreProduct(item.product));
    }
    return guestWishlist.flatMap((slug) => {
      const product = catalogue.get(slug);
      return product ? [product] : [];
    });
  }, [isAuthenticated, wishlistQuery.data, guestWishlist, catalogue]);

  const cartTotals = useMemo(() => {
    if (isAuthenticated && serverCart) {
      const shipping = Math.max(0, serverCart.total - serverCart.subtotal);
      return {
        subtotal: serverCart.subtotal,
        discount: serverCart.discount,
        shipping,
        total: serverCart.total,
        count: serverCart.count,
      };
    }
    // Guest preview uses the same rules the server applies at checkout.
    const subtotal = cartItems.reduce(
      (sum, item) => sum + item.product.price * (1 - item.product.discount / 100) * item.quantity,
      0,
    );
    const discount = cartItems.reduce(
      (sum, item) => sum + item.product.price * (item.product.discount / 100) * item.quantity,
      0,
    );
    const shipping = subtotal <= 0 ? 0 : 15;
    return {
      subtotal,
      discount,
      shipping,
      total: subtotal + shipping,
      count: cartItems.reduce((n, item) => n + item.quantity, 0),
    };
  }, [isAuthenticated, serverCart, cartItems]);

  // --- mutations -----------------------------------------------------------
  const addToCart = useCallback(
    (productId: string, size: string, quantity = 1) => {
      if (!isAuthenticated) {
        setGuestCart((prev) => {
          const index = prev.findIndex((i) => i.productId === productId && i.size === size);
          if (index >= 0) {
            const next = [...prev];
            const current = next[index]!;
            next[index] = { ...current, quantity: Math.min(99, current.quantity + quantity) };
            return next;
          }
          return [...prev, { productId, size, quantity }];
        });
        toast.success("Added to cart");
        return;
      }

      void apiClient
        .post<ApiCartSummary>("/cart", { productId, size, quantity })
        .then(() => {
          invalidateCart();
          toast.success("Added to cart");
        })
        .catch((error: unknown) => toast.error(errorMessage(error, "Could not add to cart")));
    },
    [isAuthenticated, invalidateCart],
  );

  const removeFromCart = useCallback(
    (productId: string, size: string) => {
      if (!isAuthenticated) {
        setGuestCart((prev) => prev.filter((i) => !(i.productId === productId && i.size === size)));
        return;
      }
      void apiClient
        .delete(`/cart/${encodeURIComponent(productId)}`, { params: { size } })
        .then(invalidateCart)
        .catch((error: unknown) => toast.error(errorMessage(error, "Could not remove item")));
    },
    [isAuthenticated, invalidateCart],
  );

  const updateQuantity = useCallback(
    (productId: string, size: string, quantity: number) => {
      if (!isAuthenticated) {
        setGuestCart((prev) =>
          quantity <= 0
            ? prev.filter((i) => !(i.productId === productId && i.size === size))
            : prev.map((i) =>
                i.productId === productId && i.size === size
                  ? { ...i, quantity: Math.min(99, quantity) }
                  : i,
              ),
        );
        return;
      }
      void apiClient
        .put(`/cart/${encodeURIComponent(productId)}`, { size, quantity })
        .then(invalidateCart)
        .catch((error: unknown) => toast.error(errorMessage(error, "Could not update quantity")));
    },
    [isAuthenticated, invalidateCart],
  );

  const clearCart = useCallback(() => {
    if (!isAuthenticated) {
      setGuestCart([]);
      return;
    }
    void apiClient
      .delete("/cart")
      .then(invalidateCart)
      .catch((error: unknown) => toast.error(errorMessage(error, "Could not clear your bag")));
  }, [isAuthenticated, invalidateCart]);

  const toggleWishlist = useCallback(
    (productId: string) => {
      if (!isAuthenticated) {
        setGuestWishlist((prev) => {
          if (prev.includes(productId)) {
            toast("Removed from wishlist");
            return prev.filter((id) => id !== productId);
          }
          toast.success("Added to wishlist");
          return [...prev, productId];
        });
        return;
      }
      void apiClient
        .post<{ wishlisted: boolean }>("/wishlist/toggle", { productId })
        .then((result) => {
          invalidateWishlist();
          if (result.wishlisted) toast.success("Added to wishlist");
          else toast("Removed from wishlist");
        })
        .catch((error: unknown) => toast.error(errorMessage(error, "Could not update wishlist")));
    },
    [isAuthenticated, invalidateWishlist],
  );

  const isWishlisted = useCallback(
    (productId: string) => wishlistIds.includes(productId),
    [wishlistIds],
  );

  const moveWishlistToCart = useCallback(
    (productId: string) => {
      if (!isAuthenticated) {
        const product = catalogue.get(productId);
        const size = product?.sizes[0] ?? "One Size";
        setGuestCart((prev) => {
          const index = prev.findIndex((i) => i.productId === productId && i.size === size);
          if (index >= 0) {
            const next = [...prev];
            const current = next[index]!;
            next[index] = { ...current, quantity: Math.min(99, current.quantity + 1) };
            return next;
          }
          return [...prev, { productId, size, quantity: 1 }];
        });
        setGuestWishlist((prev) => prev.filter((id) => id !== productId));
        toast.success("Moved to cart");
        return;
      }
      void apiClient
        .post("/wishlist/move-to-cart", { productId, quantity: 1 })
        .then(() => {
          invalidateCart();
          invalidateWishlist();
          toast.success("Moved to cart");
        })
        .catch((error: unknown) => toast.error(errorMessage(error, "Could not move to cart")));
    },
    [isAuthenticated, catalogue, invalidateCart, invalidateWishlist],
  );

  /** Adopts guest state into the account, then clears it locally. */
  const adoptGuestState = useCallback(async () => {
    const localCart = loadJSON<CartItem[]>(STORAGE.cart, []);
    const localWishlist = loadJSON<string[]>(STORAGE.wishlist, []);

    try {
      if (localCart.length > 0) {
        await apiClient.post("/cart/merge", { items: localCart });
      }
      if (localWishlist.length > 0) {
        await apiClient.post("/wishlist/merge", { productIds: localWishlist });
      }
    } catch {
      // A failed merge must never block a successful sign-in.
    }

    setGuestCart([]);
    setGuestWishlist([]);
    saveJSON(STORAGE.cart, []);
    saveJSON(STORAGE.wishlist, []);
  }, []);

  const finishAuth = useCallback(
    async (result: ApiAuthResult) => {
      setToken(result.token);
      setHasToken(true);
      queryClient.setQueryData(["auth", "me"], { user: result.user });
      await adoptGuestState();
      await queryClient.invalidateQueries({ queryKey: ["cart"] });
      await queryClient.invalidateQueries({ queryKey: ["wishlist"] });
    },
    [queryClient, adoptGuestState],
  );

  const login = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      try {
        const result = await apiClient.post<ApiAuthResult>("/auth/login", { email, password });
        await finishAuth(result);
        toast.success("Welcome back");
        return true;
      } catch (error) {
        toast.error(errorMessage(error, "Could not sign in"));
        return false;
      }
    },
    [finishAuth],
  );

  const register = useCallback(
    async (name: string, email: string, password: string): Promise<boolean> => {
      try {
        const result = await apiClient.post<ApiAuthResult>("/auth/register", {
          name,
          email,
          password,
        });
        await finishAuth(result);
        toast.success("Account created");
        return true;
      } catch (error) {
        toast.error(errorMessage(error, "Could not create your account"));
        return false;
      }
    },
    [finishAuth],
  );

  const logout = useCallback(() => {
    void apiClient.post("/auth/logout").catch(() => {
      // Clearing local state matters more than the server acknowledging.
    });
    setToken(null);
    setHasToken(false);
    queryClient.setQueryData(["auth", "me"], null);
    queryClient.removeQueries({ queryKey: ["cart"] });
    queryClient.removeQueries({ queryKey: ["wishlist"] });
    // Otherwise the signed-in customer's cached conversation id and
    // transcript would linger — merely paused, not erased, since the chat
    // widget's queries are only disabled, not unmounted — and the guest
    // session that follows could pick up a stale authenticated conversation.
    queryClient.removeQueries({ queryKey: ["chat"] });
    toast("Signed out");
  }, [queryClient]);

  const value = useMemo<StoreContextValue>(
    () => ({
      cart: isAuthenticated
        ? cartItems.map(({ productId, size, quantity }) => ({ productId, size, quantity }))
        : guestCart,
      wishlist: wishlistIds,
      user,
      cartItems,
      wishlistItems,
      cartCount: cartTotals.count,
      cartSubtotal: cartTotals.subtotal,
      cartShipping: cartTotals.shipping,
      cartTotal: cartTotals.total,
      cartDiscount: cartTotals.discount,
      isAuthenticated,
      authReady,
      authUnavailable,
      retryAuth,
      wishlistLoading: isAuthenticated && wishlistQuery.isPending,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      toggleWishlist,
      isWishlisted,
      moveWishlistToCart,
      login,
      register,
      logout,
      refreshCart: invalidateCart,
    }),
    [
      isAuthenticated,
      authReady,
      authUnavailable,
      retryAuth,
      wishlistQuery.isPending,
      guestCart,
      wishlistIds,
      user,
      cartItems,
      wishlistItems,
      cartTotals,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      toggleWishlist,
      isWishlisted,
      moveWishlistToCart,
      login,
      register,
      logout,
      invalidateCart,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
