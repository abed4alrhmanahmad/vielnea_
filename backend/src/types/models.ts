import type { UserRole } from "./api.js";

/** Public-safe user shape (never includes password_hash). */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface Category {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  productCount?: number;
}

export interface ProductImage {
  id: string;
  imageUrl: string;
  altText: string | null;
  sortOrder: number;
}

export interface ProductSize {
  size: string;
  stock: number;
  sortOrder: number;
}

/**
 * Garment measurements.
 * `labels` preserves the original ordered label/value map from the storefront
 * (e.g. "Sleeve Length" -> "25 cm") and is what the UI renders. The numeric
 * columns hold the parsed standard dimensions for querying/filtering.
 */
export interface ProductMeasurement {
  size: string;
  bust: number | null;
  waist: number | null;
  hips: number | null;
  length: number | null;
  labels: Record<string, string>;
}

export interface Product {
  id: string;
  slug: string;
  title: string;
  description: string;
  categoryId: string;
  category: string;
  categoryLabel: string;
  price: number;
  discount: number;
  finalPrice: number;
  stock: number;
  rating: number;
  reviewCount: number;
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  hasGift: boolean;
  modelHeight: string | null;
  modelWeight: string | null;
  wearingSize: string | null;
  images: string[];
  imageDetails: ProductImage[];
  sizes: string[];
  sizeDetails: ProductSize[];
  measurements: Record<string, string>;
  measurementDetails: ProductMeasurement[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Accessories are complementary / gift items and are a separate entity from
 * clothing Products: no category, no sizes, no measurements, no model details.
 * They never take part in the product category/filter system.
 */
export interface AccessoryImage {
  id: string;
  imageUrl: string;
  altText: string | null;
  sortOrder: number;
}

export interface Accessory {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  discount: number;
  finalPrice: number;
  stock: number;
  isAvailable: boolean;
  isFeatured: boolean;
  sortOrder: number;
  images: string[];
  imageDetails: AccessoryImage[];
  createdAt: string;
  updatedAt: string;
}

/** One slide of the homepage hero carousel. */
export interface HeroSlide {
  id: string;
  imageUrl: string;
  eyebrowText: string;
  heading: string;
  description: string;
  buttonText: string;
  buttonLink: string;
  displayOrder: number;
  isActive: boolean;
  /** CSS object-position for the slide image's cover crop. */
  objectPosition: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * One picture in the homepage Instagram marquee.
 *
 * The unit is a single image, not an Instagram post: several of these
 * routinely share one `instagramUrl` because the owner picked more than one
 * picture out of the same carousel. Nothing is grouped, and nothing is fetched
 * from Instagram — the URL is only where a click goes.
 */
export interface SelectedImage {
  id: string;
  imageUrl: string;
  /** The post this tile links to, or null — a tile with no link opens the homepage. */
  instagramUrl: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One milestone in the About page's company timeline. */
export interface TimelineEntry {
  id: string;
  year: string;
  title: string;
  description: string;
  imageUrl: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * The timeline feature switch, backed by the CMS `timeline` section on the
 * About page rather than by a settings table of its own.
 */
export interface TimelineFeature {
  enabled: boolean;
  /** The CMS section to PUT to when toggling; null if never seeded. */
  sectionId: string | null;
  title: string | null;
  subtitle: string | null;
  content: string | null;
}

/** One question in the site FAQ. */
export interface Faq {
  id: string;
  question: string;
  answer: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * The FAQ section switch and header copy, backed by the CMS `faq` section on
 * the FAQ page rather than by a settings table of its own.
 */
export interface FaqSection {
  enabled: boolean;
  /** The CMS section to PUT to when toggling or editing; null if not seeded. */
  sectionId: string | null;
  title: string | null;
  subtitle: string | null;
  content: string | null;
}

export interface CartItem {
  id: string;
  productId: string;
  slug: string;
  size: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  product: Product;
}

export interface CartSummary {
  items: CartItem[];
  count: number;
  subtotal: number;
  discount: number;
  total: number;
}

export interface WishlistItem {
  id: string;
  productId: string;
  slug: string;
  addedAt: string;
  product: Product;
}

export type OrderStatus = "pending" | "paid" | "processing" | "shipped" | "delivered" | "cancelled";

/**
 * How the order is paid for.
 *  - "card" settles at checkout, exactly as orders have always behaved.
 *  - "cod"  is collected by the courier on delivery, so it starts unpaid.
 */
export type PaymentMethod = "card" | "cod";
export type PaymentStatus = "pending" | "paid";

export interface OrderItem {
  id: string;
  productId: string | null;
  productTitle: string;
  productSlug: string | null;
  imageUrl: string | null;
  size: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  subtotal: number;
  /** Saving from product-level discounts. */
  discount: number;
  shipping: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  /**
   * Safe card metadata, null for Cash on Delivery. The card number and CVV are
   * never stored, so there is nothing else to expose.
   */
  paymentReference: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  customerName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string | null;
  country: string | null;
  notes: string | null;
  items: OrderItem[];
  createdAt: string;
}

export interface Review {
  id: string;
  productId: string;
  userId: string | null;
  authorName: string;
  rating: number;
  comment: string;
  verified: boolean;
  helpfulCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewStats {
  count: number;
  average: number;
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>;
}

// ---------------------------------------------------------------------------
// Live chat
// ---------------------------------------------------------------------------
// Stored in public.chat_threads / public.chat_messages. The API speaks
// "conversation" and "message"; the columns are thread_id / body / read_at.

export type ChatSenderRole = "customer" | "admin";

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderRole: ChatSenderRole;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface ChatConversation {
  id: string;
  userId: string | null;
  /**
   * For a guest thread this is the generated "Anonymous N" and the email is
   * empty — no personal information is collected for a guest, so there is none
   * to expose. For an account thread these stay the customer's real name and
   * email, exactly as before.
   */
  customerName: string;
  customerEmail: string;
  /** True when no account is behind this thread. */
  isGuest: boolean;
  /** The N in "Anonymous N". Null for account threads. */
  anonymousNumber: number | null;
  status: "open" | "closed";
  /** Unread messages sent by the other party, for the viewer asking. */
  unreadCount: number;
  lastMessage: ChatMessage | null;
  lastMessageAt: string;
  /** True while the customer holds an open realtime stream. */
  online: boolean;
  createdAt: string;
  updatedAt: string;
}
