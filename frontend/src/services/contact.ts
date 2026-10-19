import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient, errorMessage } from "@/lib/api/client";

export interface ContactInput {
  name: string;
  email: string;
  subject?: string;
  message: string;
}

export async function submitContact(input: ContactInput): Promise<{ message: string }> {
  return apiClient.post<{ id: string; createdAt: string; message: string }>("/contact", input);
}

export function useContactMutation() {
  return useMutation({
    mutationFn: submitContact,
    onSuccess: (result) => toast.success(result.message),
    onError: (error) => toast.error(errorMessage(error, "Could not send your message")),
  });
}

export async function subscribeNewsletter(
  email: string,
  source = "storefront",
): Promise<{ email: string; alreadySubscribed: boolean; message: string }> {
  return apiClient.post("/newsletter", { email, source });
}

export function useNewsletterMutation() {
  return useMutation({
    mutationFn: ({ email, source }: { email: string; source?: string }) =>
      subscribeNewsletter(email, source),
    onSuccess: (result) => {
      if (result.alreadySubscribed) toast(result.message);
      else toast.success(result.message);
    },
    onError: (error) => toast.error(errorMessage(error, "Could not subscribe")),
  });
}
