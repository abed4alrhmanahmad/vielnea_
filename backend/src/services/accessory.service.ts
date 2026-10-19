import { pool, withTransaction } from "../lib/db.js";
import {
  accessoryRepository,
  type AccessoryListResult,
} from "../repositories/accessory.repository.js";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors.js";
import { slugify } from "../utils/slug.js";
import type { Accessory } from "../types/models.js";
import type { z } from "zod";
import type {
  AccessoryQuery,
  createAccessorySchema,
  updateAccessorySchema,
} from "../schemas/index.js";

type CreateInput = z.infer<typeof createAccessorySchema>;
type UpdateInput = z.infer<typeof updateAccessorySchema>;

/**
 * Derives a unique slug from the name, appending -2, -3, ... on collision.
 * Accessories are created from a single name field with no slug input in the
 * admin form, so two "Silk Ribbon" entries must not fail with a 409.
 */
async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base);
  if (!root) throw new BadRequestError("Could not derive a slug from the name");

  let candidate = root;
  for (let suffix = 2; await accessoryRepository.existsBySlug(candidate, excludeId); suffix += 1) {
    candidate = `${root.slice(0, 76)}-${suffix}`;
    if (suffix > 500) throw new ConflictError("Could not derive a unique slug for this accessory");
  }
  return candidate;
}

/** Writes the image list for an accessory, replacing whatever was there. */
async function replaceImages(
  accessoryId: string,
  images: CreateInput["images"],
  fallbackAlt: string,
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query("DELETE FROM public.accessory_images WHERE accessory_id = $1", [
      accessoryId,
    ]);
    for (const [index, image] of images.entries()) {
      await client.query(
        `INSERT INTO public.accessory_images (accessory_id, image_url, alt_text, sort_order)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (accessory_id, image_url) DO NOTHING`,
        [accessoryId, image.imageUrl, image.altText ?? fallbackAlt, index],
      );
    }
  });
}

export const accessoryService = {
  async list(query: AccessoryQuery): Promise<AccessoryListResult> {
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    ) {
      throw new BadRequestError("minPrice cannot be greater than maxPrice");
    }
    return accessoryRepository.findMany(query);
  },

  async getByIdOrSlug(idOrSlug: string): Promise<Accessory> {
    const accessory = await accessoryRepository.findByIdOrSlug(idOrSlug);
    if (!accessory) throw new NotFoundError("Accessory not found");
    return accessory;
  },

  async create(input: CreateInput): Promise<Accessory> {
    // An explicit slug is honoured as given and must be free; a derived one is
    // made unique automatically.
    if (input.slug && (await accessoryRepository.existsBySlug(input.slug))) {
      throw new ConflictError(`An accessory with the slug "${input.slug}" already exists`);
    }
    const slug = input.slug ?? (await uniqueSlug(input.name));

    const result = await pool.query<{ id: string }>(
      `INSERT INTO public.accessories
         (slug, name, description, price, discount, stock,
          is_available, is_featured, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        slug,
        input.name,
        input.description,
        input.price,
        input.discount,
        input.stock,
        input.isAvailable,
        input.isFeatured,
        input.sortOrder,
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("Insert returned no id");

    if (input.images.length > 0) await replaceImages(id, input.images, input.name);

    return this.getByIdOrSlug(id);
  },

  async update(idOrSlug: string, input: UpdateInput): Promise<Accessory> {
    const existing = await this.getByIdOrSlug(idOrSlug);

    const columnMap: Record<string, string> = {
      name: "name",
      description: "description",
      price: "price",
      discount: "discount",
      stock: "stock",
      isAvailable: "is_available",
      isFeatured: "is_featured",
      sortOrder: "sort_order",
    };

    const assignments: string[] = [];
    const params: unknown[] = [];

    for (const [key, column] of Object.entries(columnMap)) {
      const value = (input as Record<string, unknown>)[key];
      if (value !== undefined) {
        params.push(value);
        assignments.push(`${column} = $${params.length}`);
      }
    }

    if (input.slug !== undefined) {
      if (await accessoryRepository.existsBySlug(input.slug, existing.id)) {
        throw new ConflictError(`An accessory with the slug "${input.slug}" already exists`);
      }
      params.push(input.slug);
      assignments.push(`slug = $${params.length}`);
    }

    if (assignments.length > 0) {
      params.push(existing.id);
      await pool.query(
        `UPDATE public.accessories SET ${assignments.join(", ")} WHERE id = $${params.length}`,
        params,
      );
    }

    // Images are replaced wholesale only when explicitly provided, so a patch
    // that omits them leaves the existing gallery untouched.
    if (input.images) {
      await replaceImages(existing.id, input.images, input.name ?? existing.name);
    }

    return this.getByIdOrSlug(existing.id);
  },

  async remove(idOrSlug: string): Promise<void> {
    const accessory = await this.getByIdOrSlug(idOrSlug);
    const deleted = await accessoryRepository.deleteById(accessory.id);
    if (!deleted) throw new NotFoundError("Accessory not found");
  },
};
