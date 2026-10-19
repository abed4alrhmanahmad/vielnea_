import { queryOne } from "../lib/db.js";

interface ContactRow {
  id: string;
  created_at: Date;
}

interface NewsletterRow {
  id: string;
  email: string;
  status: string;
  created_at: Date;
  was_new: boolean;
}

export const messageRepository = {
  async createContactMessage(input: {
    name: string;
    email: string;
    subject?: string | undefined;
    message: string;
  }): Promise<{ id: string; createdAt: string }> {
    const row = await queryOne<ContactRow>(
      `INSERT INTO public.contact_messages (name, email, subject, message)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [input.name, input.email, input.subject ?? null, input.message],
    );
    if (!row) throw new Error("Failed to store contact message");
    return { id: row.id, createdAt: new Date(row.created_at).toISOString() };
  },

  /**
   * Subscribing twice is not an error — the existing row is returned with
   * was_new = false so the API can report "already subscribed" instead of a 409.
   * A previously unsubscribed address is re-subscribed.
   */
  async subscribeNewsletter(input: {
    email: string;
    source?: string | undefined;
  }): Promise<{ id: string; email: string; alreadySubscribed: boolean }> {
    const row = await queryOne<NewsletterRow>(
      `WITH upsert AS (
         INSERT INTO public.newsletter_subscribers (email, source, status)
         VALUES ($1, $2, 'subscribed')
         ON CONFLICT (lower(email)) DO UPDATE
           SET status = 'subscribed'
         RETURNING id, email, status, created_at,
                   (xmax = 0) AS was_new
       )
       SELECT * FROM upsert`,
      [input.email, input.source ?? null],
    );
    if (!row) throw new Error("Failed to subscribe");
    return { id: row.id, email: row.email, alreadySubscribed: !row.was_new };
  },
};
