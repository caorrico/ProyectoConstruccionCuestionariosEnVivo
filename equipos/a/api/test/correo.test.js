const { test } = require('node:test');
const assert = require('node:assert/strict');
const { opcionesSmtp, permiteSmtpSinTls, mailerDesdeEntorno } = require('../dist/correo');

test('smtp:// exige STARTTLS y usa el puerto 587 por defecto', () => {
  const o = opcionesSmtp({ SMTP_URL: 'smtp://correo.espe.edu.ec' });
  assert.equal(o.secure, false);
  assert.equal(o.requireTLS, true);
  assert.equal(o.port, 587);
  assert.equal(o.auth, undefined);
});

test('smtps:// usa TLS implícito y decodifica las credenciales', () => {
  const o = opcionesSmtp({ SMTP_URL: 'smtps://avisos%40espe.edu.ec:cl%40ve@correo.espe.edu.ec' });
  assert.equal(o.secure, true);
  assert.equal(o.port, 465);
  assert.deepEqual(o.auth, { user: 'avisos@espe.edu.ec', pass: 'cl@ve' });
});

test('rechaza protocolos distintos de smtp y smtps', () => {
  assert.throws(() => opcionesSmtp({ SMTP_URL: 'http://correo.espe.edu.ec' }), /no admite el protocolo/);
});

test('el texto claro solo se acepta hacia Mailpit o un host local', () => {
  assert.equal(permiteSmtpSinTls({}, 'mailpit'), false);
  assert.equal(permiteSmtpSinTls({ SMTP_SIN_TLS: 'true' }, 'mailpit'), true);
  assert.equal(permiteSmtpSinTls({ SMTP_SIN_TLS: 'true' }, '127.0.0.1'), true);
  assert.throws(() => permiteSmtpSinTls({ SMTP_SIN_TLS: 'true' }, 'correo.espe.edu.ec'), /solo se permite/);
});

test('sin SMTP_URL los mensajes se descartan sin error', async () => {
  const mailer = mailerDesdeEntorno({});
  await mailer.enviar({ para: 'docente@espe.edu.ec', asunto: 'Prueba', texto: 'Hola' });
});

test('SMTP_SIN_TLS hacia un host externo impide arrancar', () => {
  assert.throws(() => mailerDesdeEntorno({ SMTP_URL: 'smtp://correo.espe.edu.ec', SMTP_SIN_TLS: 'true' }), /solo se permite/);
});
