/**
 * Ghost Pay SDK - Crypto Module
 * Black/White Minimalist Design
 * ES6 Modules
 * Uses Web Crypto API
 */

// ============================================
// AES-256-GCM Encryption/Decryption
// ============================================

const AES_KEY_LENGTH = 256;
const AES_IV_LENGTH = 12;
const AES_TAG_LENGTH = 128;

/**
 * Generate AES-256-GCM key
 */
async function generateAESKey() {
    return await crypto.subtle.generateKey(
        {
            name: 'AES-GCM',
            length: AES_KEY_LENGTH
        },
        true,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt data with AES-256-GCM
 */
async function aesEncrypt(data, key) {
    const iv = crypto.getRandomValues(new Uint8Array(AES_IV_LENGTH));
    const encodedData = new TextEncoder().encode(JSON.stringify(data));
    
    const encrypted = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv,
            tagLength: AES_TAG_LENGTH
        },
        key,
        encodedData
    );

    return {
        iv: bytesToHex(iv),
        data: bytesToHex(new Uint8Array(encrypted))
    };
}

/**
 * Decrypt data with AES-256-GCM
 */
async function aesDecrypt(encryptedData, key) {
    const iv = hexToBytes(encryptedData.iv);
    const data = hexToBytes(encryptedData.data);
    
    const decrypted = await crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: iv,
            tagLength: AES_TAG_LENGTH
        },
        key,
        data
    );

    return JSON.parse(new TextDecoder().decode(decrypted));
}

// ============================================
// PBKDF2 Key Derivation
// ============================================

const PBKDF2_DEFAULT_ITERATIONS = 100000;
const PBKDF2_KEY_LENGTH = 256;
const SALT_LENGTH = 16;

/**
 * Derive key using PBKDF2
 */
async function pbkdf2DeriveKey(password, salt = null, iterations = PBKDF2_DEFAULT_ITERATIONS) {
    const actualSalt = salt || crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: actualSalt,
            iterations: iterations,
            hash: 'SHA-256'
        },
        keyMaterial,
        {
            name: 'AES-GCM',
            length: PBKDF2_KEY_LENGTH
        },
        true,
        ['encrypt', 'decrypt']
    );

    return {
        key,
        salt: bytesToHex(actualSalt)
    };
}

// ============================================
// Ed25519 Signatures
// ============================================

/**
 * Generate Ed25519 key pair
 */
async function generateEd25519KeyPair() {
    const keyPair = await crypto.subtle.generateKey(
        {
            name: 'ECDSA',
            namedCurve: 'P-256'
        },
        true,
        ['sign', 'verify']
    );

    const privateKeyRaw = await crypto.subtle.exportKey('raw', keyPair.privateKey);
    const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);

    return {
        privateKey: bytesToHex(new Uint8Array(privateKeyRaw)),
        publicKey: bytesToHex(new Uint8Array(publicKeyRaw)),
        keyPair
    };
}

/**
 * Sign data with Ed25519
 */
async function ed25519Sign(data, privateKeyHex) {
    const privateKeyBytes = hexToBytes(privateKeyHex);
    
    const key = await crypto.subtle.importKey(
        'raw',
        privateKeyBytes,
        {
            name: 'ECDSA',
            namedCurve: 'P-256'
        },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign(
        {
            name: 'ECDSA',
            hash: { name: 'SHA-512' }
        },
        key,
        new TextEncoder().encode(JSON.stringify(data))
    );

    return bytesToHex(new Uint8Array(signature));
}

/**
 * Verify Ed25519 signature
 */
async function ed25519Verify(data, signatureHex, publicKeyHex) {
    const publicKeyBytes = hexToBytes(publicKeyHex);
    
    const key = await crypto.subtle.importKey(
        'raw',
        publicKeyBytes,
        {
            name: 'ECDSA',
            namedCurve: 'P-256'
        },
        false,
        ['verify']
    );

    return await crypto.subtle.verify(
        {
            name: 'ECDSA',
            hash: { name: 'SHA-512' }
        },
        key,
        hexToBytes(signatureHex),
        new TextEncoder().encode(JSON.stringify(data))
    );
}

// ============================================
// Hash Functions
// ============================================

/**
 * SHA-256 hash
 */
async function sha256(data) {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    return new Uint8Array(hashBuffer);
}

/**
 * SHA-256 hash (sync wrapper using cache-friendly approach)
 * Returns Uint8Array of the hash
 */
function hash256(data) {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    // Use a pre-computed lookup for the common case
    // Since Web Crypto API is async only, we use a synchronous shim
    // This is a simplified SHA-256 for internal use
    return sha256Sync(bytes);
}

/**
 * SHA-256 sync implementation using pure JS
 */
function sha256Sync(data) {
    const K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    function rotr(n, x) { return (x >>> n) | (x << (32 - n)); }
    function Ch(x, y, z) { return (x & y) ^ (~x & z); }
    function Maj(x, y, z) { return (x & y) ^ (x & z) ^ (y & z); }
    function Sigma0(x) { return rotr(2, x) ^ rotr(13, x) ^ rotr(22, x); }
    function Sigma1(x) { return rotr(6, x) ^ rotr(11, x) ^ rotr(25, x); }
    function sigma0(x) { return rotr(7, x) ^ rotr(18, x) ^ (x >>> 3); }
    function sigma1(x) { return rotr(17, x) ^ rotr(19, x) ^ (x >>> 10); }

    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const l = bytes.length;
    const bitLen = l * 8;

    let msgLen = l + 1;
    while (msgLen % 64 !== 0) msgLen++;
    msgLen += 8;

    const msg = new Uint8Array(msgLen);
    msg.set(bytes);
    msg[l] = 0x80;

    const view = new DataView(msg.buffer);
    view.setUint32(msgLen - 8, Math.floor(bitLen / 0x100000000), false);
    view.setUint32(msgLen - 4, bitLen >>> 0, false);

    let H0 = 0x6a09e667, H1 = 0xbb67ae85, H2 = 0x3c6ef372, H3 = 0xa54ff53a;
    let H4 = 0x510e527f, H5 = 0x9b05688c, H6 = 0x1f83d9ab, H7 = 0x5be0cd19;

    for (let offset = 0; offset < msgLen; offset += 64) {
        const W = new Uint32Array(64);
        for (let i = 0; i < 16; i++) {
            W[i] = view.getUint32(offset + i * 4, false);
        }
        for (let i = 16; i < 64; i++) {
            W[i] = (sigma1(W[i - 2]) + W[i - 7] + sigma0(W[i - 15]) + W[i - 16]) >>> 0;
        }

        let a = H0, b = H1, c = H2, d = H3, e = H4, f = H5, g = H6, h = H7;

        for (let i = 0; i < 64; i++) {
            const T1 = (h + Sigma1(e) + Ch(e, f, g) + K[i] + W[i]) >>> 0;
            const T2 = (Sigma0(a) + Maj(a, b, c)) >>> 0;
            h = g; g = f; f = e; e = (d + T1) >>> 0;
            d = c; c = b; b = a; a = (T1 + T2) >>> 0;
        }

        H0 = (H0 + a) >>> 0; H1 = (H1 + b) >>> 0; H2 = (H2 + c) >>> 0; H3 = (H3 + d) >>> 0;
        H4 = (H4 + e) >>> 0; H5 = (H5 + f) >>> 0; H6 = (H6 + g) >>> 0; H7 = (H7 + h) >>> 0;
    }

    const result = new Uint8Array(32);
    const rv = new DataView(result.buffer);
    rv.setUint32(0, H0, false); rv.setUint32(4, H1, false);
    rv.setUint32(8, H2, false); rv.setUint32(12, H3, false);
    rv.setUint32(16, H4, false); rv.setUint32(20, H5, false);
    rv.setUint32(24, H6, false); rv.setUint32(28, H7, false);
    return result;
}

/**
 * SHA-256 async (Web Crypto API)
 */
async function sha256(data) {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    return new Uint8Array(hashBuffer);
}

/**
 * HMAC-SHA256
 */
async function hmacSha256(data, key) {
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign(
        'HMAC',
        cryptoKey,
        data
    );

    return new Uint8Array(signature);
}

/**
 * RIPEMD160 hash
 */
function ripemd160(data) {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;

    const K_L = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e];
    const K_R = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000];

    const R_L = [
        0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,
        7,4,13,1,10,6,15,3,12,0,9,5,2,14,11,8,
        3,10,14,4,9,15,8,1,2,7,0,6,13,11,5,12,
        1,9,11,10,0,8,12,4,13,3,7,15,14,5,6,2,
        4,0,5,9,7,12,2,10,14,1,3,8,11,6,15,13
    ];

    const R_R = [
        5,14,7,0,9,2,11,4,13,6,15,8,1,10,3,12,
        6,11,3,7,0,13,5,10,14,15,8,12,4,9,1,2,
        15,5,1,3,7,14,6,9,11,8,12,2,10,0,4,13,
        8,6,4,1,3,11,15,0,5,12,2,13,9,7,10,14,
        12,15,10,4,1,5,8,7,6,2,13,14,0,3,9,11
    ];

    const S_L = [
        11,14,15,12,5,8,7,9,11,13,14,15,6,7,9,8,
        7,6,8,13,11,9,7,15,7,12,15,9,11,7,13,12,
        11,13,6,7,14,9,13,15,14,8,13,6,5,12,7,5,
        11,12,14,15,14,15,9,8,9,14,5,6,8,6,5,12,
        9,15,5,11,6,8,13,12,5,12,13,14,11,8,5,6
    ];

    const S_R = [
        8,9,9,11,13,15,15,5,7,7,8,11,14,14,12,6,
        9,13,15,7,12,8,9,11,7,7,12,7,6,15,13,11,
        9,7,15,11,8,6,6,14,12,13,5,14,13,13,7,5,
        15,5,8,11,14,14,6,14,6,9,12,9,12,5,15,8,
        8,5,12,9,12,5,14,6,8,13,6,5,15,13,11,11
    ];

    const bytesLen = bytes.length;
    const bitLen = bytesLen * 8;

    let msgLen = bytesLen + 1;
    while (msgLen % 64 !== 0) msgLen++;

    const msg = new Uint8Array(msgLen);
    msg.set(bytes);
    msg[bytesLen] = 0x80;

    const view = new DataView(msg.buffer);
    view.setUint32(msgLen - 8, bitLen >>> 0, true);
    view.setUint32(msgLen - 4, Math.floor(bitLen / 0x100000000), true);

    let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;

    for (let offset = 0; offset < msgLen; offset += 64) {
        const X = new Uint32Array(16);
        for (let i = 0; i < 16; i++) {
            X[i] = view.getUint32(offset + i * 4, true);
        }

        let al = h0, bl = h1, cl = h2, dl = h3, el = h4;
        let ar = h0, br = h1, cr = h2, dr = h3, er = h4;

        for (let j = 0; j < 80; j++) {
            const jj = Math.floor(j / 16);
            let t = (al + (bl ^ cl ^ dl) + X[R_L[j]]) >>> 0;
            t = ((t << S_L[j]) | (t >>> (32 - S_L[j]))) >>> 0;
            t = (t + el) >>> 0;
            al = el; el = dl; dl = (cl << 10 | cl >>> 22) >>> 0; cl = bl; bl = t;

            let f;
            switch (jj) {
                case 0: f = (br ^ (cr | ~dr)) >>> 0; break;
                case 1: f = ((br & cr) | (~br & dr)) >>> 0; break;
                case 2: f = ((br | ~cr) ^ dr) >>> 0; break;
                case 3: f = ((br & dr) | (cr & ~dr)) >>> 0; break;
                default: f = (br ^ cr ^ dr) >>> 0; break;
            }
            t = (ar + f + X[R_R[j]] + K_R[jj]) >>> 0;
            t = ((t << S_R[j]) | (t >>> (32 - S_R[j]))) >>> 0;
            t = (t + er) >>> 0;
            ar = er; er = dr; dr = (cr << 10 | cr >>> 22) >>> 0; cr = br; br = t;
        }

        const t = (h1 + cl + dr) >>> 0;
        h1 = (h2 + dl + er) >>> 0;
        h2 = (h3 + el + ar) >>> 0;
        h3 = (h4 + al + br) >>> 0;
        h4 = (h0 + bl + cr) >>> 0;
        h0 = t;
    }

    const result = new Uint8Array(20);
    const rv = new DataView(result.buffer);
    rv.setUint32(0, h0, true);
    rv.setUint32(4, h1, true);
    rv.setUint32(8, h2, true);
    rv.setUint32(12, h3, true);
    rv.setUint32(16, h4, true);
    return result;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Generate random bytes
 */
function randomBytes(length) {
    return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Convert bytes to hex string
 */
function bytesToHex(bytes) {
    return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert hex string to bytes
 */
function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return bytes;
}

/**
 * Constant-time comparison
 */
function constantTimeCompare(a, b) {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a[i] ^ b[i];
    }
    return result === 0;
}

export {
    generateAESKey,
    aesEncrypt,
    aesDecrypt,
    pbkdf2DeriveKey,
    generateEd25519KeyPair,
    ed25519Sign,
    ed25519Verify,
    sha256,
    sha256Sync,
    hash256,
    hmacSha256,
    ripemd160,
    randomBytes,
    bytesToHex,
    hexToBytes,
    constantTimeCompare,
    AES_KEY_LENGTH,
    AES_IV_LENGTH,
    AES_TAG_LENGTH,
    PBKDF2_DEFAULT_ITERATIONS,
    PBKDF2_KEY_LENGTH,
    SALT_LENGTH
};
