import axios from 'axios';
import crypto from 'crypto';

interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
}

interface CloudinaryUploadResponse {
  secure_url: string;
  public_id: string;
  width?: number;
  height?: number;
}

let runtimeConfig: CloudinaryConfig | null = null;

export function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  const folder = process.env.CLOUDINARY_FOLDER?.trim() || 'attendance-app';

  if (!cloudName || !apiKey || !apiSecret) {
    runtimeConfig = null;
    return false;
  }

  runtimeConfig = {
    cloudName,
    apiKey,
    apiSecret,
    folder
  };

  return true;
}

export function isCloudinaryReady() {
  return runtimeConfig !== null;
}

export async function uploadImageDataUrlToCloudinary(dataUrl: string) {
  if (!runtimeConfig) {
    throw new Error('Cloudinary is not configured.');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signUploadParams(
    {
      folder: runtimeConfig.folder,
      timestamp
    },
    runtimeConfig.apiSecret
  );

  const payload = new URLSearchParams();
  payload.set('file', dataUrl);
  payload.set('api_key', runtimeConfig.apiKey);
  payload.set('timestamp', String(timestamp));
  payload.set('folder', runtimeConfig.folder);
  payload.set('signature', signature);

  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(runtimeConfig.cloudName)}/image/upload`;
  const response = await axios.post<CloudinaryUploadResponse>(url, payload.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  return {
    url: response.data.secure_url,
    publicId: response.data.public_id,
    width: response.data.width,
    height: response.data.height
  };
}

function signUploadParams(params: Record<string, string | number>, apiSecret: string) {
  const toSign = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return crypto
    .createHash('sha1')
    .update(`${toSign}${apiSecret}`)
    .digest('hex');
}
