const { v2: cloudinary } = require('cloudinary');

const cleanEnv = (value) => {
  if (!value) return '';
  return String(value).trim().replace(/^['"]|['"]$/g, '');
};

const hasRealValue = (value) => Boolean(
  cleanEnv(value) &&
  !cleanEnv(value).toLowerCase().startsWith('your_')
);

const hasCloudinaryUrl = hasRealValue(process.env.CLOUDINARY_URL);
const hasCloudinaryParts = (
  hasRealValue(process.env.CLOUDINARY_CLOUD_NAME) &&
  hasRealValue(process.env.CLOUDINARY_API_KEY) &&
  hasRealValue(process.env.CLOUDINARY_API_SECRET)
);

if (hasCloudinaryParts) {
  cloudinary.config({
    cloud_name: cleanEnv(process.env.CLOUDINARY_CLOUD_NAME),
    api_key: cleanEnv(process.env.CLOUDINARY_API_KEY),
    api_secret: cleanEnv(process.env.CLOUDINARY_API_SECRET)
  });
} else if (hasRealValue(process.env.CLOUDINARY_CLOUD_NAME)) {
  cloudinary.config({
    cloud_name: cleanEnv(process.env.CLOUDINARY_CLOUD_NAME)
  });
}

const getUploadPreset = () => cleanEnv(process.env.CLOUDINARY_UPLOAD_PRESET);

const isCloudinaryConfigured = () => (
  (hasRealValue(process.env.CLOUDINARY_CLOUD_NAME) && hasRealValue(process.env.CLOUDINARY_UPLOAD_PRESET)) ||
  hasCloudinaryUrl ||
  hasCloudinaryParts
);

const uploadToCloudinary = (file, options = {}) => {
  if (!file || !file.buffer) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: 'artivio',
      resource_type: 'auto',
      ...options
    };
    const uploadPreset = getUploadPreset();
    const callback = (error, result) => {
      if (error) return reject(error);
      resolve(result);
    };

    const stream = uploadPreset
      ? cloudinary.uploader.unsigned_upload_stream(uploadPreset, uploadOptions, callback)
      : cloudinary.uploader.upload_stream(uploadOptions, callback);

    stream.end(file.buffer);
  });
};

module.exports = {
  isCloudinaryConfigured,
  uploadToCloudinary
};
