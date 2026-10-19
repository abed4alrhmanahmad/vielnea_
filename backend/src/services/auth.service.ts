import { userRepository } from "../repositories/user.repository.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { signToken } from "../utils/jwt.js";
import { ConflictError, UnauthorizedError } from "../lib/errors.js";
import type { PublicUser } from "../types/models.js";

export interface AuthResult {
  user: PublicUser;
  token: string;
}

function issue(user: PublicUser): AuthResult {
  return {
    user,
    token: signToken({ sub: user.id, email: user.email, role: user.role }),
  };
}

export const authService = {
  async register(input: { name: string; email: string; password: string }): Promise<AuthResult> {
    if (await userRepository.existsByEmail(input.email)) {
      throw new ConflictError("An account with that email already exists");
    }
    const passwordHash = await hashPassword(input.password);
    const user = await userRepository.create({
      name: input.name,
      email: input.email,
      passwordHash,
    });
    return issue(user);
  },

  async login(input: { email: string; password: string }): Promise<AuthResult> {
    const found = await userRepository.findByEmailWithHash(input.email);

    // Same error and comparable timing whether the email exists or not, so the
    // endpoint cannot be used to enumerate registered addresses.
    if (!found) {
      await verifyPassword(input.password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinva");
      throw new UnauthorizedError("Incorrect email or password");
    }

    const ok = await verifyPassword(input.password, found.passwordHash);
    if (!ok) throw new UnauthorizedError("Incorrect email or password");

    return issue(found.user);
  },

  async me(userId: string): Promise<PublicUser> {
    const user = await userRepository.findById(userId);
    if (!user) throw new UnauthorizedError("Your account no longer exists");
    return user;
  },

  /**
   * Updates the caller's own name and email.
   *
   * The id comes from the verified token, never from the request body, so a
   * customer can only ever edit themselves. The role is not touched.
   */
  async updateProfile(
    userId: string,
    input: { name: string; email: string },
  ): Promise<AuthResult> {
    if (await userRepository.emailTakenByAnother(input.email, userId)) {
      throw new ConflictError("An account with that email already exists");
    }
    const user = await userRepository.updateProfile(userId, input);
    if (!user) throw new UnauthorizedError("Your account no longer exists");
    // The email is part of the token payload, so a change needs a fresh token.
    return issue(user);
  },

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const found = await userRepository.findByIdWithHash(userId);
    if (!found) throw new UnauthorizedError("Your account no longer exists");

    const ok = await verifyPassword(currentPassword, found.passwordHash);
    if (!ok) throw new UnauthorizedError("Your current password is incorrect");

    await userRepository.updatePasswordHash(userId, await hashPassword(newPassword));
    return { message: "Password updated" };
  },
};
