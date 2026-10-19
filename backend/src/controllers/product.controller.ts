import { asyncHandler, buildPagination, sendData, sendPaginated } from "../lib/http.js";
import { productService } from "../services/product.service.js";
import { BadRequestError } from "../lib/errors.js";
import { SUPPORTED_IMAGE_LABEL, uploadProductImage } from "../lib/storage.js";
import {
  createProductSchema,
  idParamSchema,
  productQuerySchema,
  slugParamSchema,
  updateProductSchema,
} from "../schemas/index.js";

export const productController = {
  list: asyncHandler(async (req, res) => {
    const query = productQuerySchema.parse(req.query);
    const { products, total } = await productService.list(query);
    sendPaginated(res, products, buildPagination(total, query.page, query.limit));
  }),

  getById: asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const product = await productService.getByIdOrSlug(id);
    sendData(res, product);
  }),

  getBySlug: asyncHandler(async (req, res) => {
    const { slug } = slugParamSchema.parse(req.params);
    const product = await productService.getBySlug(slug);
    sendData(res, product);
  }),

  related: asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const limit = Number.parseInt(String(req.query["limit"] ?? "4"), 10);
    const products = await productService.related(id, Number.isFinite(limit) ? limit : 4);
    sendData(res, products);
  }),

  create: asyncHandler(async (req, res) => {
    const input = createProductSchema.parse(req.body);
    const product = await productService.create(input);
    sendData(res, product, 201);
  }),

  /**
   * Stores one uploaded product image and returns its public URL, which the
   * admin panel then submits as a normal `images[].imageUrl`. The body is the
   * raw file (see the express.raw parser on this route), so the same create
   * endpoint keeps working unchanged for pasted URLs.
   */
  uploadImage: asyncHandler(async (req, res) => {
    if (!Buffer.isBuffer(req.body)) {
      throw new BadRequestError(
        `Send the raw image bytes with an image Content-Type (${SUPPORTED_IMAGE_LABEL})`,
      );
    }
    const url = await uploadProductImage(req.body, req.get("content-type") ?? "");
    sendData(res, { url }, 201);
  }),

  update: asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const input = updateProductSchema.parse(req.body);
    const product = await productService.update(id, input);
    sendData(res, product);
  }),

  remove: asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    await productService.remove(id);
    sendData(res, { message: "Product deleted" });
  }),
};
