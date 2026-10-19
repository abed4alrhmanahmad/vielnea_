/**
 * Customer profile mutations.
 *
 * These call the same `/auth/*` endpoints the rest of the app already uses —
 * there is no second user system. The signed-in identity is read from the JWT
 * server-side, so nothing here can address another customer's account.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, setToken } from "@/lib/api/client";
import type { ApiAuthResult, ApiUser } from "@/lib/api/types";

export interface ProfileInput {
  name: string;
  email: string;
}

export interface PasswordInput {
  currentPassword: string;
  newPassword: string;
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProfileInput) => apiClient.put<ApiAuthResult>("/auth/me", input),
    onSuccess: (result) => {
      // The email lives inside the token, so the server issues a new one.
      setToken(result.token);
      queryClient.setQueryData<{ user: ApiUser }>(["auth", "me"], { user: result.user });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (input: PasswordInput) =>
      apiClient.put<{ message: string }>("/auth/password", input),
  });
}
