import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, ValidateBy } from 'class-validator';
import { esCorreoDocente, normalizarCorreo, passwordIssue } from './reglas';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

function EsCorreoDocente() {
  return ValidateBy({
    name: 'esCorreoDocente',
    validator: {
      validate: value => typeof value === 'string' && esCorreoDocente(value),
      defaultMessage: () => 'El correo debe ser institucional (@espe.edu.ec)',
    },
  });
}

function EsContrasenaSegura() {
  return ValidateBy({
    name: 'esContrasenaSegura',
    validator: {
      validate: value => typeof value === 'string' && passwordIssue(value) === null,
      defaultMessage: args =>
        typeof args?.value === 'string' ? `La contraseña ${passwordIssue(args.value)}` : 'La contraseña es obligatoria',
    },
  });
}

// Cuerpo de POST /api/v1/auth/register (RF-01, RN-01, RN-02).
// class-validator evalúa los decoradores de abajo hacia arriba y, con stopAtFirstError,
// informa solo el primero que falla: la comprobación de "obligatorio" va al final.
export class RegistroDto {
  @Transform(recortar)
  @MaxLength(80, { message: 'Los nombres admiten hasta 80 caracteres' })
  @IsNotEmpty({ message: 'Los nombres son obligatorios' })
  @IsString({ message: 'Los nombres son obligatorios' })
  nombres!: string;

  @Transform(recortar)
  @MaxLength(80, { message: 'Los apellidos admiten hasta 80 caracteres' })
  @IsNotEmpty({ message: 'Los apellidos son obligatorios' })
  @IsString({ message: 'Los apellidos son obligatorios' })
  apellidos!: string;

  @Transform(({ value }) => (typeof value === 'string' ? normalizarCorreo(value) : value))
  @EsCorreoDocente()
  @MaxLength(254, { message: 'El correo admite hasta 254 caracteres' })
  @IsString({ message: 'El correo es obligatorio' })
  correo!: string;

  // Límite superior para que el hash argon2 no sea una vía de abuso.
  @MaxLength(128, { message: 'La contraseña admite hasta 128 caracteres' })
  @EsContrasenaSegura()
  contrasena!: string;
}
