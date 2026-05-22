// Minimal Web Push builder for Cloudflare Pages Functions. It uses only Web
// Crypto and browser-compatible globals so Pages does not need nodejs_compat.

export async function buildPushPayload(message, subscription, vapid) {
  const vapidHeaders = await createVapidHeaders(subscription, vapid);
  const encrypted = await encryptNotification(
    subscription,
    new TextEncoder().encode(
      typeof message.data === "string" || typeof message.data === "number"
        ? message.data.toString()
        : JSON.stringify(message.data)
    )
  );

  return {
    method: "POST",
    headers: {
      ...vapidHeaders,
      "crypto-key": `dh=${bytesToBase64Url(encrypted.localPublicKeyBytes)};${vapidHeaders["crypto-key"]}`,
      encryption: `salt=${bytesToBase64Url(encrypted.salt)}`,
      ttl: String(message.options?.ttl || 60),
      ...(message.options?.urgency && { urgency: message.options.urgency }),
      ...(message.options?.topic && { topic: message.options.topic }),
      "content-encoding": "aesgcm",
      "content-length": String(encrypted.ciphertext.byteLength),
      "content-type": "application/octet-stream"
    },
    body: encrypted.ciphertext
  };
}

async function createVapidHeaders(subscription, vapid) {
  assert(vapid.subject, "VAPID subject is missing.");
  assert(vapid.privateKey, "VAPID private key is missing.");
  assert(vapid.publicKey, "VAPID public key is missing.");

  const publicKeyBytes = base64UrlToBytes(vapid.publicKey);
  const signingKey = await getCrypto().subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: bytesToBase64Url(publicKeyBytes.slice(1, 33)),
      y: bytesToBase64Url(publicKeyBytes.slice(33, 65)),
      d: vapid.privateKey
    },
    {
      name: "ECDSA",
      namedCurve: "P-256"
    },
    false,
    ["sign"]
  );
  const jwt = await signJwt({
    aud: new URL(subscription.endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: vapid.subject
  }, signingKey);

  return {
    authorization: `WebPush ${jwt}`,
    "crypto-key": `p256ecdsa=${vapid.publicKey}`
  };
}

async function signJwt(payload, key) {
  const header = objectToBase64Url({ typ: "JWT", alg: "ES256" });
  const body = objectToBase64Url({
    iat: Math.floor(Date.now() / 1000),
    ...payload
  });
  const data = `${header}.${body}`;
  const signature = await getCrypto().subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    key,
    new TextEncoder().encode(data)
  );

  return `${data}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function encryptNotification(subscription, plaintext) {
  const clientKeys = await deriveClientKeys(subscription);
  const salt = getCrypto().getRandomValues(new Uint8Array(16));
  const localKeys = await getCrypto().subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256"
    },
    true,
    ["deriveBits"]
  );
  const localPublicJwk = await getCrypto().subtle.exportKey("jwk", localKeys.publicKey);
  const localPublicKeyBytes = ecJwkToBytes(localPublicJwk);
  const sharedSecret = await getCrypto().subtle.deriveBits(
    {
      name: "ECDH",
      public: clientKeys.publicKey
    },
    localKeys.privateKey,
    256
  );
  const ikmHkdf = await hkdf(clientKeys.authSecretBytes, sharedSecret);
  const ikm = await ikmHkdf.extract(createInfo2("auth"), 32);
  const messageHkdf = await hkdf(salt, ikm);
  const cekBytes = await messageHkdf.extract(
    createInfo(clientKeys.publicBytes, localPublicKeyBytes, "aesgcm"),
    16
  );
  const nonceBytes = await messageHkdf.extract(
    createInfo(clientKeys.publicBytes, localPublicKeyBytes, "nonce"),
    12
  );
  const cekKey = await getCrypto().subtle.importKey(
    "raw",
    cekBytes,
    {
      name: "AES-GCM",
      length: 128
    },
    false,
    ["encrypt"]
  );
  const padded = new Uint8Array([0, 0, ...plaintext]);
  const ciphertext = await getCrypto().subtle.encrypt(
    {
      name: "AES-GCM",
      iv: generateNonce(new Uint8Array(nonceBytes), 0)
    },
    cekKey,
    padded
  );

  return {
    ciphertext: new Uint8Array(ciphertext),
    salt,
    localPublicKeyBytes
  };
}

async function deriveClientKeys(subscription) {
  const publicBytes = base64UrlToBytes(subscription.keys.p256dh);
  const publicKey = await getCrypto().subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: bytesToBase64Url(publicBytes.slice(1, 33)),
      y: bytesToBase64Url(publicBytes.slice(33, 65)),
      ext: true
    },
    {
      name: "ECDH",
      namedCurve: "P-256"
    },
    true,
    []
  );

  return {
    publicBytes,
    publicKey,
    authSecretBytes: base64UrlToBytes(subscription.keys.auth)
  };
}

async function hkdf(salt, ikm) {
  const prk = await hmac(salt, ikm);

  return {
    extract: (info, length) => {
      return hmac(prk, new Uint8Array([...new Uint8Array(info), 1]))
        .then((hash) => hash.slice(0, length));
    }
  };
}

async function hmac(keyBytes, data) {
  if (keyBytes.byteLength === 0) {
    return new ArrayBuffer(32);
  }

  const key = await getCrypto().subtle.importKey(
    "raw",
    keyBytes,
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  return getCrypto().subtle.sign("HMAC", key, data);
}

function createInfo(clientPublic, serverPublic, type) {
  return new Uint8Array([
    ...new TextEncoder().encode(`Content-Encoding: ${type}\0`),
    ...new TextEncoder().encode("P-256\0"),
    ...encodeLength(clientPublic.byteLength),
    ...clientPublic,
    ...encodeLength(serverPublic.byteLength),
    ...serverPublic
  ]);
}

function createInfo2(type) {
  return new TextEncoder().encode(`Content-Encoding: ${type}\0`);
}

function ecJwkToBytes(jwk) {
  assert(jwk.x, "Public key x value is missing.");
  assert(jwk.y, "Public key y value is missing.");

  return new Uint8Array([
    0x04,
    ...base64UrlToBytes(jwk.x),
    ...base64UrlToBytes(jwk.y)
  ]);
}

function generateNonce(base, index) {
  const nonce = base.slice(0, 12);

  for (let offset = 0; offset < 6; offset += 1) {
    nonce[nonce.length - 1 - offset] ^= (index / 256 ** offset) & 0xff;
  }

  return nonce;
}

function encodeLength(length) {
  return new Uint8Array([0, length]);
}

function objectToBase64Url(value) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlToBytes(value) {
  const padded = `${value}${"=".repeat((4 - value.length % 4) % 4)}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  return btoa(binary)
    .replace(/\//g, "_")
    .replace(/\+/g, "-")
    .replace(/=+$/, "");
}

function getCrypto() {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto is not available in this runtime.");
  }

  return globalThis.crypto;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
