import type { LoginInput, RegisterInput } from '@tourism/shared/validation';
import { UserRole } from '@tourism/shared/constants';
import type { User as UserDto } from '@tourism/shared/types';

import { HttpError } from '@/lib/errors';
import { signAccessToken } from '@/lib/auth/jwt';
import { fakePasswordCheck, hashPassword, verifyPassword } from '@/lib/auth/password';
import { serializeDocument } from '@/lib/serialize';
import { User } from '@/models';

export interface AuthResult {
  user: UserDto;
  token: string;
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const existing = await User.findOne({ email: input.email }).select('_id').lean();
  if (existing) {
    throw HttpError.conflict('Un compte existe déjà avec cet email');
  }

  const created = await User.create({
    fullName: input.fullName,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    ...(input.phone ? { phone: input.phone } : {}),
    // Le rôle n'est jamais lu depuis l'entrée : une inscription publique ne peut
    // pas produire un administrateur, même si le client envoie `role: 'ADMIN'`.
    role: UserRole.USER,
  });

  const user = serializeDocument<UserDto>(created.toObject());
  return { user, token: await issueToken(created.id as string, UserRole.USER, input.email) };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const found = await User.findOne({ email: input.email }).select('+passwordHash').lean();

  // Un email inexistant déclenche tout de même une comparaison bcrypt, afin que
  // les deux cas prennent le même temps et qu'on ne puisse pas énumérer les comptes.
  if (!found) {
    await fakePasswordCheck(input.password);
    throw HttpError.unauthorized('Email ou mot de passe incorrect');
  }

  const passwordMatches = await verifyPassword(input.password, found.passwordHash);
  if (!passwordMatches) {
    throw HttpError.unauthorized('Email ou mot de passe incorrect');
  }

  if (!found.isActive) {
    throw HttpError.forbidden('Compte désactivé');
  }

  const user = serializeDocument<UserDto>(found);
  return {
    user,
    token: await issueToken(String(found._id), found.role as UserRole, found.email),
  };
}

export async function getCurrentUser(userId: string): Promise<UserDto> {
  const found = await User.findById(userId).lean();
  if (!found) throw HttpError.notFound('Utilisateur introuvable');
  return serializeDocument<UserDto>(found);
}

function issueToken(userId: string, role: UserRole, email: string): Promise<string> {
  return signAccessToken({ sub: userId, role, email });
}
