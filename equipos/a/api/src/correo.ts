import { DynamicModule, Module } from '@nestjs/common';
import { createTransport } from 'nodemailer';

export const MAILER = Symbol('MAILER');

export interface Mailer {
  enviar(mensaje: { para: string; asunto: string; texto: string }): Promise<void>;
}

type Entorno = Record<string, string | undefined>;

const HOSTS_LOCALES = new Set(['mailpit', 'localhost', '127.0.0.1', '::1']);

// Los correos llevan enlaces de verificación y recuperación: siempre viajan cifrados.
// smtps:// usa TLS implícito (465); smtp:// exige STARTTLS con requireTLS.
export function opcionesSmtp(env: Entorno) {
  const url = new URL(env.SMTP_URL as string);
  const implicito = url.protocol === 'smtps:';
  if (!implicito && url.protocol !== 'smtp:') throw new Error(`SMTP_URL no admite el protocolo ${url.protocol}`);
  return {
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port: Number(url.port) || (implicito ? 465 : 587),
    secure: implicito,
    requireTLS: true,
    auth: url.username ? { user: decodeURIComponent(url.username), pass: decodeURIComponent(url.password) } : undefined,
  };
}

// Mailpit de desarrollo no ofrece TLS. Solo se acepta texto claro con SMTP_SIN_TLS=true
// y hacia un host local; cualquier otro destino falla al arrancar.
export function permiteSmtpSinTls(env: Entorno, host: string): boolean {
  if (env.SMTP_SIN_TLS !== 'true') return false;
  if (!HOSTS_LOCALES.has(host)) throw new Error('SMTP_SIN_TLS=true solo se permite con Mailpit o un host local');
  return true;
}

// SMTP_URL apunta a Mailpit en desarrollo; sin SMTP_URL los mensajes se descartan.
function transporteDesdeEntorno(env: Entorno) {
  if (!env.SMTP_URL) return createTransport({ jsonTransport: true });
  const opciones = opcionesSmtp(env);
  if (permiteSmtpSinTls(env, opciones.host)) {
    return createTransport({ ...opciones, requireTLS: false, ignoreTLS: true }); // NOSONAR: solo Mailpit local, validado arriba
  }
  return createTransport(opciones);
}

export function mailerDesdeEntorno(env: Entorno = process.env): Mailer {
  const transporte = transporteDesdeEntorno(env);
  const from = env.MAIL_FROM ?? 'Cuestionarios en Vivo <no-responder@espe.edu.ec>';
  return { enviar: async ({ para, asunto, texto }) => void (await transporte.sendMail({ from, to: para, subject: asunto, text: texto })) };
}

// Comparte el transporte de correo; las pruebas inyectan uno en memoria.
@Module({})
export class CorreoModule {
  static forMailer(mailer: Mailer): DynamicModule {
    return { module: CorreoModule, global: true, providers: [{ provide: MAILER, useValue: mailer }], exports: [MAILER] };
  }
}
