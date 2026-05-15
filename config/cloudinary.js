const { v2: cloudinary } = require('cloudinary');

const cleanEnv = (value) => {
  if (!value) return '';
  return String(value).trim().replace(/^['"]|['"]$/g, '');
};

const hasRealValue = (value) => Boolean(
  cleanEnv(value) &&
  !cleanEnv(value).toLowerCase().startsWith('your_')
);

// Read once at startup so every function uses the same values
const cloudName = cleanEnv(process.env.CLOUDINARY_CLOUD_NAME);
const apiKey    = cleanEnv(process.env.CLOUDINARY_API_KEY);
const apiSecret = cleanEnv(process.env.CLOUDINARY_API_SECRET);

const hasCloudinaryParts = (
  hasRealValue(cloudName) &&
  hasRealValue(apiKey) &&
  hasRealValue(apiSecret)
);

if (hasCloudinaryParts) {
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  console.log('✅ Cloudinary configured with API key/secret');
} else if (hasRealValue(process.env.CLOUDINARY_URL)) {
  // SDK auto-reads CLOUDINARY_URL — just log it
  console.log('✅ Cloudinary configured via CLOUDINARY_URL');
} else {
  console.warn('⚠️  Cloudinary NOT fully configured — uploads will fall back to local storage');
}

/** True when we have enough credentials for signed uploads */
const isCloudinaryConfigured = () =>
  hasRealValue(process.env.CLOUDINARY_CLOUD_NAME) &&
  (hasRealValue(process.env.CLOUDINARY_API_SECRET) || hasRealValue(process.env.CLOUDINARY_URL));

/**
 * Upload a multer memory-buffer file to Cloudinary (server-side signed stream).
 * options: any Cloudinary upload API options e.g. { folder, resource_type }
 */
const uploadToCloudinary = (file, options = {}) => {
  if (!file || !file.buffer) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'artivio', resource_type: 'auto', ...options },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(file.buffer);
  });
};

/**
 * Generate a signed upload signature for direct browser → Cloudinary uploads.
 * Returns exactly what seller.html's uploadToCloudinary() expects:
 *   { signature, timestamp, folder, apiKey, cloudName }
 */
const generateUploadSignature = (folder = 'artivio/products') => {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    apiSecret
  );
  return { signature, timestamp, folder, apiKey, cloudName };
};

module.exports = {
  cloudinary,
  isCloudinaryConfigured,
  uploadToCloudinary,
  generateUploadSignature
};