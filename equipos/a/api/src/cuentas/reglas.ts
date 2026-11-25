import { hash } from 'argon2';

// Reglas de cuenta compartidas por el registro, la recuperación y la semilla.

export const hashPassword = (password: string): Promise<string> => hash(password, { type: 2 /* argon2id */ });

export const DOMINIO_DOCENTE = '@espe.edu.ec';

// RN-02: mínimo 8 caracteres, al menos una mayúscula y un número.
export function passwordIssue(password: string): string | null {
  if (password.length < 8) return 'debe tener al menos 8 caracteres';
  if (!/[A-ZÑ]/.test(password)) return 'debe incluir una letra mayúscula';
  if (!/[0-9]/.test(password)) return 'debe incluir un número';
  return null;
}

export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

// RN-01: solo correos institucionales; se compara ya normalizado.
export function esCorreoDocente(correo: string): boolean {
  const local = correo.slice(0, -DOMINIO_DOCENTE.length);
  return correo.endsWith(DOMINIO_DOCENTE) && local.length > 0 && !/[@\s]/.test(local);
}
