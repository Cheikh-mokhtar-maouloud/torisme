import bcrypt from 'bcryptjs';

/**
 * Coût bcrypt. 12 correspond à environ 250 ms de calcul sur un serveur courant :
 * assez lent pour rendre une attaque par force brute hors-ligne coûteuse, assez
 * rapide pour ne pas bloquer une connexion légitime.
 */
const BCRYPT_COST = 12;

export function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, BCRYPT_COST);
}

export function verifyPassword(plainPassword: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainPassword, hash);
}

/**
 * Compare un mot de passe contre un hash factice.
 *
 * Utilisé quand l'email n'existe pas, afin que la connexion prenne le même temps
 * qu'avec un compte réel. Sans cela, l'écart de latence permet d'énumérer les
 * comptes existants.
 */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.PVQoZ0jI1u1UvhZ2ZgTh0j5DDMlKQPy';

export async function fakePasswordCheck(plainPassword: string): Promise<void> {
  await bcrypt.compare(plainPassword, DUMMY_HASH);
}
