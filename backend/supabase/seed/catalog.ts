/**
 * Seed source data.
 *
 * This is a faithful transcription of the storefront's existing mock catalog
 * (frontend/src/data/products.ts) — the same twelve products, prices,
 * discounts, stock, ratings, sizes, measurements and model information. Nothing
 * here is invented, and the frontend mock file is left in place as the record
 * of where this data came from.
 *
 * Image paths point at frontend/public/images/products/, which holds copies of
 * the original frontend/src/assets/*.jpg files. The originals are untouched.
 */

export interface SeedCategory {
  slug: string;
  label: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
}

export interface SeedProduct {
  slug: string;
  title: string;
  description: string;
  category: string;
  price: number;
  discount: number;
  stock: number;
  rating: number;
  reviewCount: number;
  images: string[];
  sizes: string[];
  measurements: Record<string, string>;
  model: { height: string; weight: string; wearingSize: string };
  isNewArrival: boolean;
  isBestSeller: boolean;
  hasGift: boolean;
}

export interface SeedReview {
  productSlug: string;
  authorName: string;
  authorEmail: string;
  rating: number;
  comment: string;
  daysAgo: number;
  verified: boolean;
  helpfulCount: number;
}

const IMG = "/images/products";
const dressImg = `${IMG}/product-dress.jpg`;
const blouseImg = `${IMG}/product-blouse.jpg`;
const pantsImg = `${IMG}/product-pants.jpg`;
const handbagImg = `${IMG}/product-handbag.jpg`;
const skirtImg = `${IMG}/product-skirt.jpg`;
const shoulderBagImg = `${IMG}/product-shoulderbag.jpg`;
const jewelryImg = `${IMG}/product-jewelry.jpg`;
const topImg = `${IMG}/product-top.jpg`;
const accessoryBroochImg = `${IMG}/product-accessory-brooch.jpg`;
const blazerCardImg = `${IMG}/product-blazer-card.jpg`;

const clothingSizes = ["XS", "S", "M", "L", "XL"];
const accessorySize = ["One Size"];

const baseModel = { height: "170 cm", weight: "55 kg", wearingSize: "M" };

const clothMeasurements = {
  Bust: "96 cm",
  Waist: "76 cm",
  Hip: "104 cm",
  Length: "120 cm",
  "Sleeve Length": "25 cm",
};

const bagMeasurements = {
  Width: "28 cm",
  Height: "22 cm",
  Depth: "10 cm",
  "Strap Drop": "22 cm",
};

/** The eight categories the storefront already offers, in its own order. */
export const seedCategories: SeedCategory[] = [
  {
    slug: "dresses",
    label: "Dresses",
    description: "Linen, satin and silk silhouettes made for everyday elegance.",
    imageUrl: dressImg,
    sortOrder: 1,
  },
  {
    slug: "blouses",
    label: "Blouses",
    description: "Refined blouses and shirts with considered drape.",
    imageUrl: blouseImg,
    sortOrder: 2,
  },
  {
    slug: "pants",
    label: "Pants",
    description: "Tailored and relaxed trousers in natural fibres.",
    imageUrl: pantsImg,
    sortOrder: 3,
  },
  {
    slug: "skirts",
    label: "Skirts",
    description: "Pleated and fluid midi skirts.",
    imageUrl: skirtImg,
    sortOrder: 4,
  },
  {
    slug: "tops",
    label: "Tops",
    description: "Silk and cotton tops with clean necklines.",
    imageUrl: topImg,
    sortOrder: 5,
  },
  {
    slug: "handbags",
    label: "Handbags",
    description: "Structured leather bags with brushed gold hardware.",
    imageUrl: handbagImg,
    sortOrder: 6,
  },
  {
    slug: "blazers",
    label: "Blazers",
    description: "Structured blazers cut for a sharp, easy silhouette.",
    imageUrl: blazerCardImg,
    sortOrder: 9,
  },
  {
    slug: "vests",
    label: "Vests",
    description: "Tailored and knitted vests to layer over the collection.",
    // Keeps the homepage card's existing artwork while the category fills out.
    imageUrl: jewelryImg,
    sortOrder: 6,
  },
  {
    slug: "jewelry",
    label: "Jewelry",
    description: "Whisper-fine gold plate, made to be layered.",
    imageUrl: jewelryImg,
    sortOrder: 7,
  },
  {
    slug: "accessories",
    label: "Accessories",
    description: "Finishing pieces for the Vielinea wardrobe.",
    imageUrl: accessoryBroochImg,
    sortOrder: 8,
  },
];

/**
 * Products in the storefront's original catalogue order. The seed staggers
 * created_at by index so the API's default "newest" sort reproduces the
 * order shoppers see today.
 */
export const seedProducts: SeedProduct[] = [
  {
    slug: "linen-midi-dress",
    title: "Linen Midi Wrap Dress",
    description:
      "An elegant linen midi dress with a flattering wrap silhouette and soft, breathable fabric. Designed for timeless everyday elegance.",
    category: "dresses",
    price: 189,
    discount: 0,
    stock: 24,
    rating: 4.8,
    reviewCount: 128,
    images: [dressImg, blouseImg, skirtImg],
    sizes: clothingSizes,
    measurements: clothMeasurements,
    model: baseModel,
    isNewArrival: true,
    isBestSeller: true,
    hasGift: false,
  },
  {
    slug: "satin-blouse",
    title: "Cream Satin Blouse",
    description:
      "A refined satin blouse with a subtle sheen, cut for effortless drape and modern minimalism.",
    category: "blouses",
    price: 129,
    discount: 10,
    stock: 40,
    rating: 4.6,
    reviewCount: 92,
    images: [blouseImg, topImg, dressImg],
    sizes: clothingSizes,
    measurements: { ...clothMeasurements, Length: "68 cm" },
    model: baseModel,
    isNewArrival: false,
    isBestSeller: true,
    hasGift: false,
  },
  {
    slug: "wide-leg-pants",
    title: "Wide Leg Linen Pants",
    description:
      "High-waisted wide leg pants in a soft linen blend. Fluid, tailored and made for warm weather ease.",
    category: "pants",
    price: 149,
    discount: 0,
    stock: 30,
    rating: 4.7,
    reviewCount: 74,
    images: [pantsImg, blouseImg],
    sizes: clothingSizes,
    measurements: { Waist: "72 cm", Hip: "100 cm", Inseam: "78 cm", Length: "110 cm" },
    model: baseModel,
    isNewArrival: true,
    isBestSeller: false,
    hasGift: false,
  },
  {
    slug: "minimal-handbag",
    title: "Minimal Top Handle Bag",
    description:
      "A structured top-handle bag crafted from smooth leather with brushed gold hardware.",
    category: "handbags",
    price: 249,
    discount: 15,
    stock: 18,
    rating: 4.9,
    reviewCount: 210,
    images: [handbagImg, shoulderBagImg],
    sizes: accessorySize,
    measurements: bagMeasurements,
    model: baseModel,
    isNewArrival: false,
    isBestSeller: true,
    hasGift: true,
  },
  {
    slug: "pleated-skirt",
    title: "Cream Pleated Midi Skirt",
    description:
      "A pleated midi skirt with fluid movement and a soft satin finish. An enduring staple.",
    category: "skirts",
    price: 139,
    discount: 0,
    stock: 22,
    rating: 4.5,
    reviewCount: 63,
    images: [skirtImg, dressImg],
    sizes: clothingSizes,
    measurements: { Waist: "70 cm", Length: "88 cm" },
    model: baseModel,
    isNewArrival: false,
    isBestSeller: false,
    hasGift: false,
  },
  {
    slug: "silk-top",
    title: "Silk Sleeveless Top",
    description: "A softly draped silk top with a clean neckline for polished, quiet luxury.",
    category: "tops",
    price: 109,
    discount: 0,
    stock: 34,
    rating: 4.4,
    reviewCount: 51,
    images: [topImg, blouseImg],
    sizes: clothingSizes,
    measurements: { Bust: "94 cm", Length: "60 cm" },
    model: baseModel,
    isNewArrival: true,
    isBestSeller: false,
    hasGift: false,
  },
  {
    slug: "shoulder-bag",
    title: "Leather Shoulder Bag",
    description:
      "A supple leather shoulder bag with a slouchy silhouette. Everyday luxury with quiet detail.",
    category: "handbags",
    price: 219,
    discount: 0,
    stock: 12,
    rating: 4.8,
    reviewCount: 189,
    images: [shoulderBagImg, handbagImg],
    sizes: accessorySize,
    measurements: bagMeasurements,
    model: baseModel,
    isNewArrival: false,
    isBestSeller: false,
    hasGift: false,
  },
  {
    slug: "gold-jewelry-set",
    title: "Delicate Gold Set",
    description:
      "A whisper-fine necklace and earring pairing in polished gold plate. Made to be layered.",
    category: "jewelry",
    price: 89,
    discount: 0,
    stock: 60,
    rating: 4.7,
    reviewCount: 142,
    images: [jewelryImg],
    sizes: accessorySize,
    measurements: { "Chain Length": "42 cm", Pendant: "0.8 cm" },
    model: baseModel,
    isNewArrival: false,
    isBestSeller: false,
    hasGift: true,
  },
  {
    slug: "linen-shirt",
    title: "Relaxed Linen Shirt",
    description:
      "An easy linen shirt with a relaxed cut, mother-of-pearl buttons and a soft collar.",
    category: "blouses",
    price: 119,
    discount: 0,
    stock: 28,
    rating: 4.5,
    reviewCount: 47,
    images: [blouseImg, topImg],
    sizes: clothingSizes,
    measurements: { Bust: "100 cm", Length: "70 cm" },
    model: baseModel,
    isNewArrival: false,
    isBestSeller: false,
    hasGift: false,
  },
  {
    slug: "satin-dress",
    title: "Satin Slip Dress",
    description:
      "A bias-cut satin slip dress with delicate straps and a fluid, unstructured drape.",
    category: "dresses",
    price: 179,
    discount: 20,
    stock: 16,
    rating: 4.6,
    reviewCount: 88,
    images: [dressImg, skirtImg],
    sizes: clothingSizes,
    measurements: clothMeasurements,
    model: baseModel,
    isNewArrival: false,
    isBestSeller: true,
    hasGift: false,
  },
  {
    slug: "tailored-trousers",
    title: "Tailored Cream Trousers",
    description:
      "Precisely tailored trousers with a pressed crease. Polished, modern, endlessly wearable.",
    category: "pants",
    price: 159,
    discount: 0,
    stock: 20,
    rating: 4.7,
    reviewCount: 66,
    images: [pantsImg],
    sizes: clothingSizes,
    measurements: { Waist: "70 cm", Inseam: "80 cm" },
    model: baseModel,
    isNewArrival: false,
    isBestSeller: false,
    hasGift: false,
  },
  {
    slug: "structured-clutch",
    title: "Structured Evening Clutch",
    description: "A minimal evening clutch with a discreet gold clasp. Made for quiet occasions.",
    category: "handbags",
    price: 149,
    discount: 0,
    stock: 14,
    rating: 4.4,
    reviewCount: 39,
    images: [handbagImg],
    sizes: accessorySize,
    measurements: { Width: "24 cm", Height: "14 cm" },
    model: baseModel,
    isNewArrival: false,
    isBestSeller: false,
    hasGift: true,
  },
];

/** Transcribed from frontend/src/services/reviews.ts seed(). */
export const seedReviews: SeedReview[] = [
  {
    productSlug: "linen-midi-dress",
    authorName: "Isabelle Moreau",
    authorEmail: "isabelle@example.com",
    rating: 5,
    comment: "Beautiful cut and exceptional fabric — the drape is perfect.",
    daysAgo: 3,
    verified: true,
    helpfulCount: 2,
  },
  {
    productSlug: "linen-midi-dress",
    authorName: "Sofia Rinaldi",
    authorEmail: "sofia@example.com",
    rating: 4,
    comment: "Wore it to a wedding — endless compliments. Runs slightly long.",
    daysAgo: 12,
    verified: true,
    helpfulCount: 0,
  },
  {
    productSlug: "satin-blouse",
    authorName: "Amélie Chen",
    authorEmail: "amelie@example.com",
    rating: 5,
    comment: "Elegant and effortless. Pairs with everything.",
    daysAgo: 6,
    verified: true,
    helpfulCount: 1,
  },
];

/**
 * Splits product stock across its sizes so the per-size totals add up to the
 * product-level figure rather than multiplying inventory.
 */
export function distributeStock(total: number, sizeCount: number): number[] {
  if (sizeCount <= 0) return [];
  if (sizeCount === 1) return [total];
  const base = Math.floor(total / sizeCount);
  const remainder = total % sizeCount;
  return Array.from({ length: sizeCount }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** "96 cm" -> 96, "0.8 cm" -> 0.8, non-numeric -> null */
export function parseMeasure(value: string | undefined): number | null {
  if (!value) return null;
  const match = /-?\d+(\.\d+)?/.exec(value);
  return match ? Number.parseFloat(match[0]) : null;
}
