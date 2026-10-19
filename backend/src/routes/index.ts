import { Router } from "express";
import { authController } from "../controllers/auth.controller.js";
import { productController } from "../controllers/product.controller.js";
import { categoryController } from "../controllers/category.controller.js";
import { accessoryController } from "../controllers/accessory.controller.js";
import { cartController } from "../controllers/cart.controller.js";
import { wishlistController } from "../controllers/wishlist.controller.js";
import { orderController } from "../controllers/order.controller.js";
import { reviewController } from "../controllers/review.controller.js";
import { messageController } from "../controllers/message.controller.js";
import { adminController } from "../controllers/admin.controller.js";
import { cmsController } from "../controllers/cms.controller.js";
import { heroSlideController } from "../controllers/hero-slide.controller.js";
import { selectedImageController } from "../controllers/selected-image.controller.js";
import { companyTimelineController } from "../controllers/company-timeline.controller.js";
import { faqController } from "../controllers/faq.controller.js";
import { chatController } from "../controllers/chat.controller.js";
import { authenticate, authorizeAdmin, optionalAuthenticate } from "../middleware/auth.js";
import { authLimiter, writeLimiter } from "../middleware/rate-limit.js";
import { sendData } from "../lib/http.js";
import { pool } from "../lib/db.js";
import { imageUploadBody } from "../middleware/image-upload.js";

const router = Router();

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
router.get("/health", (_req, res) => {
  sendData(res, { status: "ok", service: "vielinea-api", time: new Date().toISOString() });
});

router.get("/health/db", (_req, res, next) => {
  pool
    .query("SELECT 1 AS ok")
    .then(() => sendData(res, { database: "connected" }))
    .catch(next);
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
router.post("/auth/register", authLimiter, authController.register);
router.post("/auth/login", authLimiter, authController.login);
router.get("/auth/me", authenticate, authController.me);
router.put("/auth/me", authenticate, writeLimiter, authController.updateMe);
router.put("/auth/password", authenticate, authLimiter, authController.changePassword);
router.post("/auth/logout", authController.logout);

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
router.get("/categories", categoryController.list);
router.get("/categories/:id", categoryController.getById);

// ---------------------------------------------------------------------------
// Products
// Reviews are nested under a product; declared before /products/:id so the
// more specific paths win.
// ---------------------------------------------------------------------------
router.get("/products", productController.list);
router.get("/products/slug/:slug", productController.getBySlug);
router.get(
  "/products/:productId/reviews",
  optionalAuthenticate,
  reviewController.listForProduct,
);
router.post(
  "/products/:productId/reviews",
  authenticate,
  writeLimiter,
  reviewController.create,
);
router.post(
  "/products/:productId/reviews/:reviewId/helpful",
  authenticate,
  reviewController.toggleHelpful,
);
router.post(
  "/products/:productId/reviews/:reviewId/report",
  authenticate,
  writeLimiter,
  reviewController.report,
);
router.delete("/products/:productId/reviews/:reviewId", authenticate, reviewController.remove);
router.get("/products/:id/related", productController.related);
router.get("/products/:id", productController.getById);

router.post("/products", authenticate, authorizeAdmin, productController.create);
// Raw image bytes, not JSON: the global 100kb json parser does not apply here.
router.post(
  "/products/images",
  authenticate,
  authorizeAdmin,
  imageUploadBody,
  productController.uploadImage,
);
router.put("/products/:id", authenticate, authorizeAdmin, productController.update);
router.delete("/products/:id", authenticate, authorizeAdmin, productController.remove);

// ---------------------------------------------------------------------------
// Accessories
// A separate entity from products: complementary / gift items with their own
// table, their own admin section and their own storefront page. They never
// appear in the product category/filter system.
// Reads are public; every write requires an authenticated administrator.
// ---------------------------------------------------------------------------
router.get("/accessories", accessoryController.list);
router.get("/accessories/:id", accessoryController.getById);

router.post("/accessories", authenticate, authorizeAdmin, accessoryController.create);
// Raw image bytes, not JSON: the global 100kb json parser does not apply here.
router.post(
  "/accessories/images",
  authenticate,
  authorizeAdmin,
  imageUploadBody,
  accessoryController.uploadImage,
);
router.put("/accessories/:id", authenticate, authorizeAdmin, accessoryController.update);
router.delete("/accessories/:id", authenticate, authorizeAdmin, accessoryController.remove);

// ---------------------------------------------------------------------------
// Hero slides (homepage carousel)
// The public read returns active slides only. Management is admin-only and
// declared inline, matching the products/accessories write routes. `/all` is
// registered before `/:id` so it is not read as an id.
//
// Images are uploaded through the existing POST /products/images endpoint —
// there is deliberately no separate hero upload route or bucket.
// ---------------------------------------------------------------------------
router.get("/hero-slides", heroSlideController.list);
router.get("/hero-slides/all", authenticate, authorizeAdmin, heroSlideController.listAll);
router.post("/hero-slides", authenticate, authorizeAdmin, heroSlideController.create);
router.put("/hero-slides/:id", authenticate, authorizeAdmin, heroSlideController.update);
router.delete("/hero-slides/:id", authenticate, authorizeAdmin, heroSlideController.remove);

// ---------------------------------------------------------------------------
// Selected images (homepage Instagram marquee)
// One row is ONE PICTURE, not one Instagram post, and several rows may carry
// the same instagram_url — see the 0020 migration. Nothing here contacts
// Instagram; the URL is only a link destination.
//
// The public read returns active images only, already ordered, so the marquee
// renders the response as-is. Management is admin-only and declared inline,
// matching the hero-slides routes. `/all` is registered before `/:id` so it is
// not read as an id.
//
// Images are uploaded through the existing POST /products/images endpoint —
// there is deliberately no separate upload route or bucket.
// ---------------------------------------------------------------------------
router.get("/selected-images", selectedImageController.list);
router.get("/selected-images/all", authenticate, authorizeAdmin, selectedImageController.listAll);
router.post("/selected-images", authenticate, authorizeAdmin, selectedImageController.create);
router.put("/selected-images/:id", authenticate, authorizeAdmin, selectedImageController.update);
router.delete("/selected-images/:id", authenticate, authorizeAdmin, selectedImageController.remove);

// ---------------------------------------------------------------------------
// Company timeline (About page "Our Story")
// The public read returns the feature switch plus active entries; management
// is admin-only and declared inline, matching the hero-slides routes. `/all`
// is registered before `/:id` so it is not read as an id.
//
// The feature on/off switch is NOT here: it is the CMS `timeline` section's
// visibility, toggled through PUT /admin/site/sections/:id, so there is only
// one mechanism deciding whether a page section renders.
//
// Entry images are uploaded through the existing POST /products/images
// endpoint — there is no separate timeline upload route or bucket.
// ---------------------------------------------------------------------------
router.get("/company-timeline", companyTimelineController.get);
router.get(
  "/company-timeline/all",
  authenticate,
  authorizeAdmin,
  companyTimelineController.getAll,
);
router.post("/company-timeline", authenticate, authorizeAdmin, companyTimelineController.create);
router.put("/company-timeline/:id", authenticate, authorizeAdmin, companyTimelineController.update);
router.delete(
  "/company-timeline/:id",
  authenticate,
  authorizeAdmin,
  companyTimelineController.remove,
);

// ---------------------------------------------------------------------------
// FAQ
// The public read returns the section header plus active questions; management
// is admin-only and declared inline, matching the hero-slides and timeline
// routes. `/all` is registered before `/:id` so it is not read as an id.
//
// The section on/off switch and its header copy are NOT here: they are the CMS
// `faq` section, edited through PUT /admin/site/sections/:id, so there is one
// mechanism deciding whether a page section renders and what it is titled.
// ---------------------------------------------------------------------------
router.get("/faqs", faqController.list);
router.get("/faqs/all", authenticate, authorizeAdmin, faqController.listAll);
router.post("/faqs", authenticate, authorizeAdmin, faqController.create);
router.put("/faqs/:id", authenticate, authorizeAdmin, faqController.update);
router.delete("/faqs/:id", authenticate, authorizeAdmin, faqController.remove);

// ---------------------------------------------------------------------------
// Cart (all authenticated)
// ---------------------------------------------------------------------------
router.get("/cart", authenticate, cartController.get);
router.post("/cart", authenticate, cartController.add);
router.post("/cart/merge", authenticate, cartController.merge);
router.delete("/cart", authenticate, cartController.clear);
router.put("/cart/:productId", authenticate, cartController.update);
router.delete("/cart/:productId", authenticate, cartController.remove);

// ---------------------------------------------------------------------------
// Wishlist (all authenticated)
// ---------------------------------------------------------------------------
router.get("/wishlist", authenticate, wishlistController.get);
router.post("/wishlist", authenticate, wishlistController.add);
router.post("/wishlist/toggle", authenticate, wishlistController.toggle);
router.post("/wishlist/merge", authenticate, wishlistController.merge);
router.post("/wishlist/move-to-cart", authenticate, wishlistController.moveToCart);
router.delete("/wishlist/:productId", authenticate, wishlistController.remove);

// ---------------------------------------------------------------------------
// Orders (all authenticated)
// ---------------------------------------------------------------------------
router.post("/orders", authenticate, orderController.create);
router.get("/orders", authenticate, orderController.list);
router.get("/orders/:id", authenticate, orderController.getById);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Live chat — guest side.
//
// The only chat endpoints reachable without a session, and deliberately the
// minimum set: start/resume, read the transcript, send, mark read, stream.
// Authentication is not disabled anywhere else; ownership here is proved by
// the server-minted guest token, which grants access to exactly one thread.
// Writes go through the same writeLimiter as every other public write, and
// messages through the same validation and 2000-character cap.
// ---------------------------------------------------------------------------
router.post("/chat/guest/conversations", writeLimiter, chatController.startGuestConversation);
router.get("/chat/guest/stream", chatController.guestStream);
router.get("/chat/guest/conversations/:id/messages", chatController.guestListMessages);
router.post(
  "/chat/guest/conversations/:id/messages",
  writeLimiter,
  chatController.guestSendMessage,
);
router.patch("/chat/guest/conversations/:id/read", chatController.guestMarkConversationRead);

// Live chat (customer side — all authenticated, scoped to the caller)
// The SSE stream is declared before the :id routes so it is not read as an id.
// ---------------------------------------------------------------------------
router.get("/chat/stream", authenticate, chatController.stream);
router.get("/chat/unread", authenticate, chatController.unread);
router.get("/chat/conversations", authenticate, chatController.listConversations);
router.post("/chat/conversations", authenticate, chatController.startConversation);
router.get("/chat/conversations/:id/messages", authenticate, chatController.listMessages);
router.post("/chat/conversations/:id/messages", authenticate, chatController.sendMessage);
router.patch("/chat/conversations/:id/read", authenticate, chatController.markConversationRead);
router.patch("/chat/messages/:id/read", authenticate, chatController.markMessageRead);

// ---------------------------------------------------------------------------
// CMS — public reads. Published pages and visible sections only.
// ---------------------------------------------------------------------------
router.get("/site/settings", cmsController.publicSettings);
router.get("/site/testimonials", cmsController.publicTestimonials);
router.get("/site/pages/:slug", cmsController.publicPage);

// ---------------------------------------------------------------------------
// Admin — every route below requires an authenticated administrator.
// ---------------------------------------------------------------------------
const admin = Router();
admin.use(authenticate, authorizeAdmin);

// --- CMS management ---
admin.get("/site/settings", cmsController.adminSettings);
admin.put("/site/settings/store", cmsController.updateStoreSettings);
admin.put("/site/settings/:key", cmsController.updateSetting);

admin.get("/site/pages", cmsController.adminPages);
admin.get("/site/pages/:slug", cmsController.adminPage);
admin.put("/site/pages/:id", cmsController.updatePage);
admin.put("/site/sections/:id", cmsController.updateSection);

admin.get("/site/testimonials", cmsController.adminTestimonials);
admin.post("/site/testimonials", cmsController.createTestimonial);
admin.put("/site/testimonials/:id", cmsController.updateTestimonial);
admin.delete("/site/testimonials/:id", cmsController.deleteTestimonial);

admin.get("/site/media", cmsController.listMedia);
admin.post("/site/media", cmsController.createMedia);
admin.delete("/site/media/:id", cmsController.deleteMedia);

admin.get("/stats", adminController.stats);

admin.get("/orders", adminController.listOrders);
admin.get("/orders/:id", adminController.getOrder);
// PUT and PATCH both accepted — setting a single field reads naturally as either.
admin.patch("/orders/:id/status", adminController.updateOrderStatus);
admin.put("/orders/:id/status", adminController.updateOrderStatus);
admin.patch("/orders/:id/payment-status", adminController.updatePaymentStatus);
admin.put("/orders/:id/payment-status", adminController.updatePaymentStatus);

admin.get("/customers", adminController.listCustomers);
admin.get("/notifications", adminController.listNotifications);

admin.get("/reviews", adminController.listReviews);
admin.put("/reviews/:id", adminController.updateReview);
admin.delete("/reviews/:id", adminController.deleteReview);

admin.get("/chat/unread", chatController.adminUnread);
admin.get("/chat/conversations", chatController.adminListConversations);
admin.get("/chat/conversations/:id/messages", chatController.adminListMessages);
admin.post("/chat/conversations/:id/messages", chatController.adminSendMessage);
admin.patch("/chat/conversations/:id/read", chatController.adminMarkConversationRead);
admin.patch("/chat/messages/:id/read", chatController.adminMarkMessageRead);

admin.post("/categories", adminController.createCategory);
admin.put("/categories/:id", adminController.updateCategory);
admin.delete("/categories/:id", adminController.deleteCategory);

router.use("/admin", admin);

// ---------------------------------------------------------------------------
// Contact + newsletter (public, rate limited)
// ---------------------------------------------------------------------------
router.post("/contact", writeLimiter, messageController.contact);
router.post("/newsletter", writeLimiter, messageController.newsletter);

export default router;
