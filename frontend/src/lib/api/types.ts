/** Wire types returned by the Express API. */
import type { PaymentMethod, PaymentStatus } from "@/lib/payment";

export interface ApiProductImage {
  id: string;
  imageUrl: string;
  altText: string | null;
  sortOrder: number;
}

export interface ApiProductSize {
  size: string;
  stock: number;
  sortOrder: number;
}

export interface ApiProductMeasurement {
  size: string;
  bust: number | null;
  waist: number | null;
  hips: number | null;
  length: number | null;
  labels: Record<string, string>;
}

export interface ApiProduct {
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
  imageDetails: ApiProductImage[];
  sizes: string[];
  sizeDetails: ApiProductSize[];
  measurements: Record<string, string>;
  measurementDetails: ApiProductMeasurement[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Accessories are a separate entity from products: complementary / gift items
 * with no category, no sizes and no measurements. They are never part of the
 * product category/filter system.
 */
export interface ApiAccessoryImage {
  id: string;
  imageUrl: string;
  altText: string | null;
  sortOrder: number;
}

export interface ApiAccessory {
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
  imageDetails: ApiAccessoryImage[];
  createdAt: string;
  updatedAt: string;
}

export interface AccessoryListParams {
  search?: string | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  sort?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
  featured?: boolean | undefined;
  inStock?: boolean | undefined;
  availability?: "available" | "hidden" | "all" | undefined;
}

export interface ApiCategory {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  productCount?: number;
}

/** One slide of the homepage hero carousel. */
export interface ApiHeroSlide {
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
 * routinely share one `instagramUrl`, because the owner picked more than one
 * picture out of the same carousel. They are never grouped.
 */
export interface ApiSelectedImage {
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
export interface ApiTimelineEntry {
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

/** GET /company-timeline — the feature switch plus its entries. */
export interface ApiCompanyTimeline {
  enabled: boolean;
  section: {
    enabled: boolean;
    sectionId: string | null;
    title: string | null;
    subtitle: string | null;
    content: string | null;
  };
  entries: ApiTimelineEntry[];
}

/** One question in the site FAQ. */
export interface ApiFaq {
  id: string;
  question: string;
  answer: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** GET /faqs — the section switch and header copy plus its questions. */
export interface ApiFaqPayload {
  enabled: boolean;
  section: {
    enabled: boolean;
    sectionId: string | null;
    title: string | null;
    subtitle: string | null;
    content: string | null;
  };
  faqs: ApiFaq[];
}

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: "customer" | "admin";
  createdAt: string;
}

export interface ApiAuthResult {
  user: ApiUser;
  token: string;
}

export interface ApiCartItem {
  id: string;
  productId: string;
  slug: string;
  size: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  product: ApiProduct;
}

export interface ApiCartSummary {
  items: ApiCartItem[];
  count: number;
  subtotal: number;
  discount: number;
  total: number;
}

export interface ApiWishlistItem {
  id: string;
  productId: string;
  slug: string;
  addedAt: string;
  product: ApiProduct;
}

export interface ApiOrderItem {
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

export interface ApiOrder {
  id: string;
  orderNumber: string;
  userId: string;
  status: "pending" | "paid" | "processing" | "shipped" | "delivered" | "cancelled";
  subtotal: number;
  /** Saving from product-level discounts. */
  discount: number;
  shipping: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  /** Safe card metadata; null for Cash on Delivery. Never a full card number. */
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
  items: ApiOrderItem[];
  createdAt: string;
}

export interface ApiReview {
  id: string;
  productId: string;
  userId: string | null;
  authorName: string;
  rating: number;
  comment: string;
  verified: boolean;
  helpfulCount: number;
  /** Present on list responses; true when the signed-in viewer voted helpful. */
  viewerHasVotedHelpful?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiReviewStats {
  count: number;
  average: number;
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>;
}

export interface ApiReviewsResponse {
  reviews: ApiReview[];
  stats: ApiReviewStats;
}

export interface ProductListParams {
  search?: string | undefined;
  category?: string | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  sort?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
  gift?: boolean | undefined;
  newArrival?: boolean | undefined;
  bestSeller?: boolean | undefined;
  featured?: boolean | undefined;
  inStock?: boolean | undefined;
  /** Only products with an image and a price above zero. */
  complete?: boolean | undefined;
}
