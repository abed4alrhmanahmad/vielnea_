import type { Request, Response } from "express";
import { asyncHandler, sendData } from "../lib/http.js";
import { chatService } from "../services/chat.service.js";
import { requireUser } from "../middleware/auth.js";
import { subscribe, type ChatEvent } from "../lib/chat-bus.js";
import { guestStreamKey } from "../services/chat.service.js";
import { BadRequestError } from "../lib/errors.js";
import {
  chatConversationQuerySchema,
  chatIdParamSchema,
  chatMessageIdParamSchema,
  chatMessageSchema,
  startConversationSchema,
} from "../schemas/index.js";

/**
 * Opens a Server-Sent Events stream for the caller.
 *
 * The subscription is scoped by the authenticated token: a customer receives
 * only events for conversations they own, an admin receives all of them. That
 * check lives in chat-bus.publish, so no client can widen its own scope.
 */
function openStream(req: Request, res: Response): void {
  const user = requireUser(req);
  const role = user.role === "admin" ? "admin" : "customer";

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Tells nginx and friends not to buffer the stream.
    "X-Accel-Buffering": "no",
  });
  res.write(`retry: 3000\n\n`);
  res.write(`event: ready\ndata: ${JSON.stringify({ role })}\n\n`);

  const unsubscribe = subscribe(user.sub, role, (event: ChatEvent) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  });

  // Comment frames keep proxies from dropping an idle connection. This carries
  // no chat data — messages arrive by push, never by poll.
  const keepAlive = setInterval(() => {
    res.write(`: keep-alive\n\n`);
  }, 25_000);

  const close = (): void => {
    clearInterval(keepAlive);
    unsubscribe();
  };
  req.on("close", close);
  req.on("error", close);
}

/**
 * The guest's bearer token, from a header rather than the body so the same
 * value works for GET, POST and the SSE stream. It is opaque to the client:
 * the server minted it, stores only its hash, and it grants access to exactly
 * one conversation.
 */
function guestToken(req: Request): string {
  const header = req.get("X-Guest-Token") ?? "";
  const fromQuery = typeof req.query["guestToken"] === "string" ? req.query["guestToken"] : "";
  const token = (header || fromQuery).trim();
  if (!token) throw new BadRequestError("Missing guest session");
  return token;
}

/**
 * A guest's realtime stream, scoped to the one conversation their token owns.
 *
 * Ownership is proved before the stream opens, and the subscription key is
 * derived from the conversation the server resolved — never from anything the
 * client asked for — so a guest cannot subscribe to another thread.
 */
const openGuestStream = asyncHandler(async (req: Request, res: Response) => {
  const token = guestToken(req);
  const { id } = chatIdParamSchema.parse(req.query);
  const conversation = await chatService.assertGuestOwns(id, token);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`retry: 3000

`);
  res.write(`event: ready
data: ${JSON.stringify({ role: "customer" })}

`);

  const unsubscribe = subscribe(
    guestStreamKey(conversation.id),
    "customer",
    (event: ChatEvent) => {
      res.write(`event: ${event.type}
data: ${JSON.stringify(event)}

`);
    },
  );

  const keepAlive = setInterval(() => {
    res.write(`: keep-alive

`);
  }, 25_000);

  const close = (): void => {
    clearInterval(keepAlive);
    unsubscribe();
  };
  req.on("close", close);
  req.on("error", close);
});

export const chatController = {
  stream: openStream,

  // -------------------------------------------------------------------------
  // Guest — the only unauthenticated chat surface
  // -------------------------------------------------------------------------
  guestStream: openGuestStream,

  startGuestConversation: asyncHandler(async (req, res) => {
    // A token may or may not exist yet; absent simply means a new visitor.
    const existing = (req.get("X-Guest-Token") ?? "").trim();
    const result = await chatService.startGuestConversation(existing || undefined);
    // guestToken is returned here and nowhere else — subsequent requests carry
    // it in the header. Only its hash is stored server-side.
    sendData(res, result, 201);
  }),

  guestListMessages: asyncHandler(async (req, res) => {
    const token = guestToken(req);
    const { id } = chatIdParamSchema.parse(req.params);
    sendData(res, await chatService.messagesForGuest(id, token));
  }),

  guestSendMessage: asyncHandler(async (req, res) => {
    const token = guestToken(req);
    const { id } = chatIdParamSchema.parse(req.params);
    const { message } = chatMessageSchema.parse(req.body);
    sendData(res, await chatService.sendAsGuest(id, token, message), 201);
  }),

  guestMarkConversationRead: asyncHandler(async (req, res) => {
    const token = guestToken(req);
    const { id } = chatIdParamSchema.parse(req.params);
    sendData(res, await chatService.markReadAsGuest(id, token));
  }),

  // -------------------------------------------------------------------------
  // Customer
  // -------------------------------------------------------------------------
  listConversations: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    sendData(res, await chatService.listForCustomer(sub));
  }),

  startConversation: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    const { subject } = startConversationSchema.parse(req.body ?? {});
    const conversation = await chatService.startConversation(sub, subject);
    sendData(res, conversation, 201);
  }),

  listMessages: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    const { id } = chatIdParamSchema.parse(req.params);
    sendData(res, await chatService.messagesForCustomer(id, sub));
  }),

  sendMessage: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    const { id } = chatIdParamSchema.parse(req.params);
    const { message } = chatMessageSchema.parse(req.body);
    sendData(res, await chatService.sendAsCustomer(id, sub, message), 201);
  }),

  markConversationRead: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    const { id } = chatIdParamSchema.parse(req.params);
    sendData(res, await chatService.markReadAsCustomer(id, sub));
  }),

  markMessageRead: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    const { id } = chatMessageIdParamSchema.parse(req.params);
    sendData(res, await chatService.markMessageReadAsCustomer(id, sub));
  }),

  unread: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    sendData(res, await chatService.unreadForCustomer(sub));
  }),

  // -------------------------------------------------------------------------
  // Admin — mounted behind authenticate + authorizeAdmin
  // -------------------------------------------------------------------------
  adminListConversations: asyncHandler(async (req, res) => {
    const { status } = chatConversationQuerySchema.parse(req.query);
    sendData(res, await chatService.listForAdmin(status));
  }),

  adminListMessages: asyncHandler(async (req, res) => {
    const { id } = chatIdParamSchema.parse(req.params);
    sendData(res, await chatService.messagesForAdmin(id));
  }),

  adminSendMessage: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    const { id } = chatIdParamSchema.parse(req.params);
    const { message } = chatMessageSchema.parse(req.body);
    sendData(res, await chatService.sendAsAdmin(id, sub, message), 201);
  }),

  adminMarkConversationRead: asyncHandler(async (req, res) => {
    const { id } = chatIdParamSchema.parse(req.params);
    sendData(res, await chatService.markReadAsAdmin(id));
  }),

  adminMarkMessageRead: asyncHandler(async (req, res) => {
    const { id } = chatMessageIdParamSchema.parse(req.params);
    sendData(res, await chatService.markMessageReadAsAdmin(id));
  }),

  adminUnread: asyncHandler(async (_req, res) => {
    sendData(res, await chatService.unreadForAdmin());
  }),
};
