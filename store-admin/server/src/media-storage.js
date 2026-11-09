import { v2 as cloudinary } from 'cloudinary';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const CLOUDINARY_REF_PREFIX = 'cloudinary:v1:';
const PRODUCT_UPLOAD_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads/products');
const PRODUCT_IMAGE_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function mediaStorageMode() {
  return String(process.env.MEDIA_STORAGE || 'local').trim().toLowerCase();
}

function cloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME?.trim()
    && process.env.CLOUDINARY_API_KEY?.trim()
    && process.env.CLOUDINARY_API_SECRET?.trim(),
  );
}

function configureCloudinary() {
  if (!cloudinaryConfigured()) {
    throw new Error('MEDIA_STORAGE=cloudinary requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME.trim(),
    api_key: process.env.CLOUDINARY_API_KEY.trim(),
    api_secret: process.env.CLOUDINARY_API_SECRET.trim(),
    secure: true,
  });
}

function cloudinaryResourceType(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'raw';
}

function encodeCloudinaryRef({ resourceType, publicId, format }) {
  return `${CLOUDINARY_REF_PREFIX}${resourceType}:${encodeURIComponent(publicId)}:${format}`;
}

export function parseCloudinaryRef(value) {
  if (typeof value !== 'string' || !value.startsWith(CLOUDINARY_REF_PREFIX)) return null;
  const rest = value.slice(CLOUDINARY_REF_PREFIX.length);
  const firstSeparator = rest.indexOf(':');
  const lastSeparator = rest.lastIndexOf(':');
  if (firstSeparator < 1 || lastSeparator <= firstSeparator) return null;
  const resourceType = rest.slice(0, firstSeparator);
  if (!['image', 'video', 'raw'].includes(resourceType)) return null;
  try {
    return {
      resourceType,
      publicId: decodeURIComponent(rest.slice(firstSeparator + 1, lastSeparator)),
      format: rest.slice(lastSeparator + 1),
    };
  } catch {
    return null;
  }
}

export function isCloudinaryRef(value) {
  return parseCloudinaryRef(value) !== null;
}

export async function storeUploadedMedia(file, folder) {
  file.storageRef = path.basename(file.filename || file.path);
  if (mediaStorageMode() !== 'cloudinary') return file.storageRef;

  configureCloudinary();
  const resourceType = cloudinaryResourceType(file.mimetype);
  const extension = path.extname(file.originalname || file.path).toLowerCase();
  const publicId = `${randomUUID()}${resourceType === 'raw' ? extension : ''}`;
  const asset = await cloudinary.uploader.upload(file.path, {
    resource_type: resourceType,
    type: 'authenticated',
    asset_folder: `hungfashion/${folder}`,
    public_id: publicId,
    use_filename: false,
    unique_filename: false,
    overwrite: false,
  });

  file.cloudinaryAsset = {
    publicId: asset.public_id,
    resourceType: asset.resource_type,
  };
  file.storageRef = encodeCloudinaryRef({
    resourceType: asset.resource_type,
    publicId: asset.public_id,
    format: asset.format || extension.replace(/^\./, '') || 'bin',
  });
  return file.storageRef;
}

export async function storeProductImage(buffer, mimetype) {
  if (mediaStorageMode() !== 'cloudinary') {
    const filename = `${randomUUID()}${PRODUCT_IMAGE_EXTENSIONS[mimetype] || '.img'}`;
    const localPath = path.join(PRODUCT_UPLOAD_DIRECTORY, filename);
    await mkdir(PRODUCT_UPLOAD_DIRECTORY, { recursive: true });
    await writeFile(localPath, buffer, { flag: 'wx' });
    return { url: `/uploads/products/${filename}`, localPath, storage: 'local' };
  }
  configureCloudinary();
  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream({
      resource_type: 'image',
      type: 'upload',
      asset_folder: 'hungfashion/products',
      public_id: randomUUID(),
      use_filename: false,
      unique_filename: false,
      overwrite: false,
    }, (error, asset) => {
      if (error) return reject(error);
      resolve({ url: asset.secure_url, publicId: asset.public_id, resourceType: asset.resource_type, storage: 'cloudinary' });
    });
    upload.end(buffer);
  });
}

export async function cleanupProductImage(asset) {
  if (asset?.storage === 'local') {
    if (asset.localPath) await unlink(asset.localPath).catch(() => {});
    return;
  }
  if (!asset?.publicId || !cloudinaryConfigured()) return;
  try {
    configureCloudinary();
    await cloudinary.uploader.destroy(asset.publicId, {
      resource_type: asset.resourceType || 'image',
      type: 'upload',
      invalidate: true,
    });
  } catch {
    // Cleanup is best-effort; preserve the original database error.
  }
}

export async function cleanupUploadedMedia(files = []) {
  await Promise.all(files.map(async file => {
    if (file.path) await unlink(file.path).catch(() => {});
    if (!file.cloudinaryAsset || !cloudinaryConfigured()) return;
    try {
      configureCloudinary();
      await cloudinary.uploader.destroy(file.cloudinaryAsset.publicId, {
        resource_type: file.cloudinaryAsset.resourceType,
        type: 'authenticated',
        invalidate: true,
      });
    } catch {
      // Cleanup is best-effort; preserve the original upload/database error.
    }
  }));
}

export async function cleanupTemporaryCopies(files = []) {
  await Promise.all(files.filter(file => file.cloudinaryAsset).map(file => unlink(file.path).catch(() => {})));
}

export async function streamCloudinaryMedia(res, storageRef, { mimeType, filename, attachment = false } = {}) {
  const asset = parseCloudinaryRef(storageRef);
  if (!asset) return false;

  configureCloudinary();
  const now = Math.floor(Date.now() / 1000);
  const url = cloudinary.utils.private_download_url(asset.publicId, asset.format, {
    resource_type: asset.resourceType,
    type: 'authenticated',
    expires_at: now + 60,
  });
  const upstream = await fetch(url);
  if (!upstream.ok || !upstream.body) {
    res.status(upstream.status === 404 ? 404 : 502).end();
    return true;
  }

  res.set({
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (mimeType) res.type(mimeType);
  if (attachment && filename) res.attachment(path.basename(filename));
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) res.set('Content-Length', contentLength);
  await pipeline(Readable.fromWeb(upstream.body), res);
  return true;
}
