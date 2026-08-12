import { createECDH } from 'node:crypto';

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

const ecdh = createECDH('prime256v1');
ecdh.generateKeys();

console.log('PUSH_VAPID_PUBLIC_KEY=' + base64url(ecdh.getPublicKey()));
console.log('PUSH_VAPID_PRIVATE_KEY=' + base64url(ecdh.getPrivateKey()));
console.log('PUSH_VAPID_SUBJECT=mailto:info@zippyweb.uk');
