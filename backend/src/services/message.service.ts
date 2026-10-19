import { messageRepository } from "../repositories/message.repository.js";
import type { z } from "zod";
import type { contactSchema, newsletterSchema } from "../schemas/index.js";

type ContactInput = z.infer<typeof contactSchema>;
type NewsletterInput = z.infer<typeof newsletterSchema>;

export const messageService = {
  /** Stores the submission. No email is sent — that is out of scope by design. */
  async submitContact(
    input: ContactInput,
  ): Promise<{ id: string; createdAt: string; message: string }> {
    const record = await messageRepository.createContactMessage(input);
    return {
      ...record,
      message: "Thank you — your message has reached us. We reply within two business days.",
    };
  },

  async subscribe(
    input: NewsletterInput,
  ): Promise<{ email: string; alreadySubscribed: boolean; message: string }> {
    const result = await messageRepository.subscribeNewsletter(input);
    return {
      email: result.email,
      alreadySubscribed: result.alreadySubscribed,
      message: result.alreadySubscribed
        ? "You are already on the list."
        : "Welcome to the Vielinea list.",
    };
  },
};
