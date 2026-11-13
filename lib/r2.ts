import crypto from 'crypto';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME || 'velime-media';
const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '';

export const isR2Configured = (): boolean => {
  return Boolean(accountId && accessKeyId && secretAccessKey && bucketName);
};

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Buffer {
  const kDate = hmac('AWS4' + key, dateStamp);
  const kRegion = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  const kSigning = hmac(kService, 'aws4_request');
  return kSigning;
}

interface S3RequestOptions {
  method: 'PUT' | 'DELETE' | 'GET';
  path: string;
  body?: Buffer;
  contentType?: string;
  cacheControl?: string;
}

async function sendS3Request(opts: S3RequestOptions): Promise<Response> {
  if (!isR2Configured()) {
    throw new Error('Cloudflare R2 credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME) are not configured');
  }

  const region = 'auto';
  const service = 's3';
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const url = `https://${host}/${bucketName}/${opts.path}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = opts.body ? sha256(opts.body) : sha256('');

  const headers: Record<string, string> = {
    host: host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  };

  if (opts.contentType) {
    headers['content-type'] = opts.contentType;
  }
  if (opts.cacheControl) {
    headers['cache-control'] = opts.cacheControl;
  }

  const signedHeaderKeys = Object.keys(headers).sort();
  const signedHeadersStr = signedHeaderKeys.join(';');
  const canonicalHeaders = signedHeaderKeys.map((k) => `${k}:${headers[k]}\n`).join('');

  const canonicalUri = `/${bucketName}/${encodeURI(opts.path)}`;
  const canonicalQuery = '';

  const canonicalRequest = [
    opts.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeadersStr,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');

  const signingKey = getSignatureKey(secretAccessKey!, dateStamp, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`;

  const fetchHeaders: Record<string, string> = {
    ...headers,
    Authorization: authorizationHeader,
  };

  const response = await fetch(url, {
    method: opts.method,
    headers: fetchHeaders,
    body: opts.body ? new Uint8Array(opts.body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`R2 Error (${response.status} ${response.statusText}): ${errorText}`);
  }

  return response;
}

export async function uploadToR2({
  buffer,
  contentType,
  folder = 'products',
  originalFileName = 'image',
}: {
  buffer: Buffer;
  contentType: string;
  folder?: 'products' | 'categories' | 'hero' | 'lookbook';
  originalFileName?: string;
}): Promise<{ success: boolean; url: string; key: string; error?: string }> {
  if (!isR2Configured()) {
    return {
      success: false,
      url: '',
      key: '',
      error: 'Cloudflare R2 is not fully configured in environment variables (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME).',
    };
  }

  try {
    const isWebp = contentType.includes('webp');
    const isPng = contentType.includes('png');
    const isSvg = contentType.includes('svg');
    const ext = isWebp ? 'webp' : isPng ? 'png' : isSvg ? 'svg' : 'jpg';

    // Sanitize filename
    const sanitizedName = (originalFileName || 'image')
      .toLowerCase()
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 30);

    const timestamp = Date.now();
    const key = `${folder}/${timestamp}-${sanitizedName}.${ext}`;

    await sendS3Request({
      method: 'PUT',
      path: key,
      body: buffer,
      contentType: contentType || 'image/jpeg',
      cacheControl: 'public, max-age=31536000, immutable',
    });

    // Build public URL
    const baseUrl = publicUrl ? publicUrl.replace(/\/$/, '') : `https://${bucketName}.${accountId}.r2.cloudflarestorage.com`;
    const finalUrl = `${baseUrl}/${key}`;

    return {
      success: true,
      url: finalUrl,
      key,
    };
  } catch (error: any) {
    console.error('Cloudflare R2 Upload Error:', error);
    return {
      success: false,
      url: '',
      key: '',
      error: error?.message || 'Failed to upload image to Cloudflare R2',
    };
  }
}

export async function deleteFromR2(keyOrUrl: string): Promise<{ success: boolean; error?: string }> {
  if (!isR2Configured()) {
    return { success: false, error: 'R2 is not configured' };
  }

  try {
    let key = keyOrUrl;
    if (keyOrUrl.startsWith('http')) {
      const url = new URL(keyOrUrl);
      key = url.pathname.replace(/^\//, '');
    }

    await sendS3Request({
      method: 'DELETE',
      path: key,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Cloudflare R2 Delete Error:', error);
    return { success: false, error: error?.message || 'Failed to delete object from R2' };
  }
}
