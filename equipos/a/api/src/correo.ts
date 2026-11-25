import { DynamicModule, Module } from '@nestjs/common';
import { createTransport } from 'nodemailer';

export const MAILER = Symbol('MAILER');

export interface Mailer {
  enviar(mensaje: { para: string; asunto: string; texto: string }): Promise<void>;
}

// SMTP_URL apunta a Mailpit en desarrollo; sin SMTP_URL los mensajes se descartan.
export function mailerDesdeEntorno(env: Record<string, string | undefined> = process.env): Mailer {
  const transporte = createTransport(env.SMTP_URL ?? { jsonTransport: true });
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
