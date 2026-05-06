const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(__dirname, '..', 'uploads');

const safeExt = (file) => {
  const originalExt = path.extname(file.originalname || '').toLowerCase();
  if (originalExt) return originalExt;

  const mimeExt = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi'
  };

  return mimeExt[file.mimetype] || '';
};

const saveUploadLocally = async (file, prefix = 'upload') => {
  if (!file || !file.buffer) return '';

  await fs.promises.mkdir(uploadsDir, { recursive: true });

  const ext = safeExt(file);
  const unique = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  const filename = `${prefix}-${unique}${ext}`;
  const destination = path.join(uploadsDir, filename);

  await fs.promises.writeFile(destination, file.buffer);
  return filename;
};

module.exports = {
  saveUploadLocally
};
