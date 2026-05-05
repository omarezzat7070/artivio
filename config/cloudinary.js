const { v2: cloudinary } = require('cloudinary');

const hasRealValue = (value) => Boolean(
  value &&
  !String(value).trim().toLowerCase().startsWith('your_')
);

const hasCloudinaryUrl = hasRealValue(process.env.CLOUDINARY_URL);
const hasCloudinaryParts = (
  hasRealValue(process.env.CLOUDINARY_CLOUD_NAME) &&
  hasRealValue(process.env.CLOUDINARY_API_KEY) &&
  hasRealValue(process.env.CLOUDINARY_API_SECRET)
);

if (!hasCloudinaryUrl && hasCloudinaryParts) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

const isCloudinaryConfigured = () => hasCloudinaryUrl || hasCloudinaryParts;

const uploadToCloudinary = (file, options = {}) => {
  if (!file || !file.buffer) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'artivio',
        resource_type: 'auto',
        ...options
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    stream.end(file.buffer);
  });
};

module.exports = {
  isCloudinaryConfigured,
  uploadToCloudinary
};
