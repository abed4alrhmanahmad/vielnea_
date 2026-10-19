import dressImg from "@/assets/product-dress.jpg";
import blouseImg from "@/assets/product-blouse.jpg";
import pantsImg from "@/assets/product-pants.jpg";
import handbagImg from "@/assets/product-handbag.jpg";
import skirtImg from "@/assets/product-skirt.jpg";
import shoulderBagImg from "@/assets/product-shoulderbag.jpg";
import jewelryImg from "@/assets/product-jewelry.jpg";
import topImg from "@/assets/product-top.jpg";

export type Category =
  | "dresses"
  | "blouses"
  | "pants"
  | "skirts"
  | "tops"
  | "handbags"
  | "jewelry"
  | "accessories";

export interface Product {
  id: string;
  title: string;
  description: string;
  category: Category;
  price: number;
  discount: number;
  stock: number;
  rating: number;
  reviewCount: number;
  images: string[];
  sizes: string[];
  measurements: Record<string, string>;
  model: { height: string; weight: string; wearingSize: string };
  isNew?: boolean;
  isBestSeller?: boolean;
  hasGift?: boolean;
}

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

export const products: Product[] = [
  {
    id: "linen-midi-dress",
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
    isNew: true,
    isBestSeller: true,
  },
  {
    id: "satin-blouse",
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
    isBestSeller: true,
  },
  {
    id: "wide-leg-pants",
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
    isNew: true,
  },
  {
    id: "minimal-handbag",
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
    isBestSeller: true,
    hasGift: true,
  },
  {
    id: "pleated-skirt",
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
  },
  {
    id: "silk-top",
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
    isNew: true,
  },
  {
    id: "shoulder-bag",
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
  },
  {
    id: "gold-jewelry-set",
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
    hasGift: true,
  },
  {
    id: "linen-shirt",
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
  },
  {
    id: "satin-dress",
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
    isBestSeller: true,
  },
  {
    id: "tailored-trousers",
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
  },
  {
    id: "structured-clutch",
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
    hasGift: true,
  },
];

export const featuredCategories = [
  { key: "dresses" as const, label: "Dresses", image: dressImg },
  { key: "handbags" as const, label: "Handbags", image: handbagImg },
  { key: "jewelry" as const, label: "Jewelry & Gifts", image: jewelryImg },
];

export const categoryLabels: Record<Category, string> = {
  dresses: "Dresses",
  blouses: "Blouses",
  pants: "Pants",
  skirts: "Skirts",
  tops: "Tops",
  handbags: "Handbags",
  jewelry: "Jewelry",
  accessories: "Accessories",
};

export function getProduct(id: string) {
  return products.find((p) => p.id === id);
}

export function getRelated(id: string, category: Category, limit = 4) {
  return products.filter((p) => p.id !== id && p.category === category).slice(0, limit);
}

export const testimonials = [
  {
    name: "Isabelle Moreau",
    location: "Paris",
    quote:
      "Vielinea captures a rare kind of restraint. Every piece feels considered — the fabrics, the fit, the finish.",
  },
  {
    name: "Amélie Chen",
    location: "New York",
    quote:
      "I've replaced half my wardrobe with Vielinea. The linen dresses feel like heirlooms already.",
  },
  {
    name: "Sofia Rinaldi",
    location: "Milan",
    quote: "Effortless, elegant and unfussy. This is quiet luxury done properly.",
  },
];
