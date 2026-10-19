import { queryOne } from "../lib/db.js";
import type { PublicUser } from "../types/models.js";
import type { UserRole } from "../types/api.js";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: Date;
}

interface UserWithHashRow extends UserRow {
  password_hash: string;
}

const PUBLIC_COLUMNS = "id, name, email, role, created_at";

function mapUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export const userRepository = {
  async findById(id: string): Promise<PublicUser | null> {
    const row = await queryOne<UserRow>(
      `SELECT ${PUBLIC_COLUMNS} FROM public.users WHERE id = $1 LIMIT 1`,
      [id],
    );
    return row ? mapUser(row) : null;
  },

  /** Includes the password hash — only for the login path. */
  async findByEmailWithHash(
    email: string,
  ): Promise<{ user: PublicUser; passwordHash: string } | null> {
    const row = await queryOne<UserWithHashRow>(
      `SELECT ${PUBLIC_COLUMNS}, password_hash FROM public.users WHERE lower(email) = lower($1) LIMIT 1`,
      [email],
    );
    return row ? { user: mapUser(row), passwordHash: row.password_hash } : null;
  },

  /** Includes the password hash — only for verifying a password change. */
  async findByIdWithHash(id: string): Promise<{ user: PublicUser; passwordHash: string } | null> {
    const row = await queryOne<UserWithHashRow>(
      `SELECT ${PUBLIC_COLUMNS}, password_hash FROM public.users WHERE id = $1 LIMIT 1`,
      [id],
    );
    return row ? { user: mapUser(row), passwordHash: row.password_hash } : null;
  },

  async existsByEmail(email: string): Promise<boolean> {
    const row = await queryOne<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM public.users WHERE lower(email) = lower($1)) AS exists",
      [email],
    );
    return row?.exists ?? false;
  },

  /** True when the address belongs to somebody other than `excludeId`. */
  async emailTakenByAnother(email: string, excludeId: string): Promise<boolean> {
    const row = await queryOne<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM public.users WHERE lower(email) = lower($1) AND id <> $2
       ) AS exists`,
      [email, excludeId],
    );
    return row?.exists ?? false;
  },

  async updateProfile(id: string, input: { name: string; email: string }): Promise<PublicUser | null> {
    const row = await queryOne<UserRow>(
      `UPDATE public.users SET name = $2, email = $3, updated_at = now()
       WHERE id = $1
       RETURNING ${PUBLIC_COLUMNS}`,
      [id, input.name, input.email.toLowerCase()],
    );
    return row ? mapUser(row) : null;
  },

  async updatePasswordHash(id: string, passwordHash: string): Promise<boolean> {
    const row = await queryOne<{ id: string }>(
      "UPDATE public.users SET password_hash = $2, updated_at = now() WHERE id = $1 RETURNING id",
      [id, passwordHash],
    );
    return Boolean(row);
  },

  async create(input: {
    name: string;
    email: string;
    passwordHash: string;
    role?: UserRole;
  }): Promise<PublicUser> {
    const row = await queryOne<UserRow>(
      `INSERT INTO public.users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING ${PUBLIC_COLUMNS}`,
      [input.name, input.email.toLowerCase(), input.passwordHash, input.role ?? "customer"],
    );
    if (!row) throw new Error("Failed to create user");
    return mapUser(row);
  },

  mapUser,
};
