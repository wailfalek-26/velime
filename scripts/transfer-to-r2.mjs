import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  });
}

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME || 'velime-media';
const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://poswtkarskyouacsjfct.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('==============================================');
console.log('🚀 TRANSFERT DIRECT SUPABASE -> CLOUDFLARE R2');
console.log('==============================================');
console.log('Source Supabase :', supabaseUrl);
console.log('Destination R2  :', `Bucket [${bucketName}] (Account: ${accountId})`);
console.log('Public CDN URL  :', publicUrl);
console.log('----------------------------------------------');

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = hmac('AWS4' + key, dateStamp);
  const kRegion = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  const kSigning = hmac(kService, 'aws4_request');
  return kSigning;
}

async function uploadToR2(buffer, contentType, key) {
  const region = 'auto';
  const service = 's3';
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const url = `https://${host}/${bucketName}/${key}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(buffer);

  const headers = {
    host: host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    'content-type': contentType || 'image/jpeg',
    'cache-control': 'public, max-age=31536000, immutable',
  };

  const signedHeaderKeys = Object.keys(headers).sort();
  const signedHeadersStr = signedHeaderKeys.join(';');
  const canonicalHeaders = signedHeaderKeys.map((k) => `${k}:${headers[k]}\n`).join('');
  const canonicalUri = `/${bucketName}/${encodeURI(key)}`;
  const canonicalQuery = '';

  const canonicalRequest = [
    'PUT',
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

  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      ...headers,
      Authorization: authorizationHeader,
    },
    body: new Uint8Array(buffer),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`R2 Error ${res.status}: ${errText}`);
  }

  const baseUrl = publicUrl ? publicUrl.replace(/\/$/, '') : `https://${bucketName}.${accountId}.r2.cloudflarestorage.com`;
  return `${baseUrl}/${key}`;
}

async function listSupabaseFiles(folder) {
  try {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/list/velime-media`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prefix: folder,
        limit: 100,
        sortBy: { column: 'name', order: 'asc' },
      }),
    });
    if (!res.ok) {
      console.warn(`Impossible de lister le dossier Supabase ${folder}: ${res.status}`);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn(`Erreur listage Supabase ${folder}:`, err.message);
    return [];
  }
}

async function transfer() {
  const folders = ['products', 'categories', 'hero', 'lookbook'];
  let totalTransferred = 0;

  for (const folder of folders) {
    console.log(`\n📂 Dossier Supabase : "${folder}"...`);
    const files = await listSupabaseFiles(folder);

    if (files.length === 0) {
      console.log(`   (Aucun fichier trouvé dans ${folder})`);
      continue;
    }

    console.log(`   ${files.length} fichier(s) trouvé(s)`);

    for (const f of files) {
      if (f.name === '.emptyFolderPlaceholder') continue;
      const key = `${folder}/${f.name}`;
      const srcUrl = `${supabaseUrl}/storage/v1/object/public/velime-media/${key}`;

      try {
        process.stdout.write(`   ⬇️ Téléchargement : ${f.name} ... `);
        const dlRes = await fetch(srcUrl);
        if (!dlRes.ok) {
          console.log(`❌ Échec (${dlRes.status})`);
          continue;
        }

        const arrayBuffer = await dlRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = dlRes.headers.get('content-type') || (f.name.endsWith('.webp') ? 'image/webp' : 'image/jpeg');

        const destUrl = await uploadToR2(buffer, contentType, key);
        console.log(`✅ Uploadé sur R2 !`);
        console.log(`      🔗 ${destUrl}`);
        totalTransferred++;
      } catch (uploadErr) {
        console.log(`❌ Erreur: ${uploadErr.message}`);
      }
    }
  }

  // Also check products from Supabase table directly for any images that might be stored elsewhere
  try {
    console.log('\n🔍 Vérification des photos référencées dans la table "products"...');
    const prodsRes = await fetch(`${supabaseUrl}/rest/v1/products?select=id,name,image,images`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    if (prodsRes.ok) {
      const prods = await prodsRes.json();
      if (Array.isArray(prods)) {
        for (const p of prods) {
          const allImgs = [p.image, ...(Array.isArray(p.images) ? p.images : [])].filter(Boolean);
          for (const imgUrl of allImgs) {
            if (typeof imgUrl === 'string' && imgUrl.startsWith('http') && !imgUrl.includes('.r2.dev')) {
              try {
                const parsed = new URL(imgUrl);
                const filename = parsed.pathname.split('/').pop();
                const key = `products/${filename}`;
                process.stdout.write(`   ⬇️ Photo article « ${p.name} » (${filename}) ... `);
                const dl = await fetch(imgUrl);
                if (dl.ok) {
                  const buf = Buffer.from(await dl.arrayBuffer());
                  const cType = dl.headers.get('content-type') || 'image/jpeg';
                  const dest = await uploadToR2(buf, cType, key);
                  console.log(`✅ OK sur R2 !`);
                  totalTransferred++;
                } else {
                  console.log(`Ignoré (${dl.status})`);
                }
              } catch (e) {
                console.log(`Ignoré (${e.message})`);
              }
            }
          }
        }
      }
    }
  } catch (tErr) {
    console.warn('Note table products:', tErr.message);
  }

  console.log('\n==============================================');
  console.log(`🎉 TRANSFERT TERMINÉ : ${totalTransferred} photo(s) sur Cloudflare R2 !`);
  console.log('==============================================');
}

transfer().catch((err) => {
  console.error('Erreur globale:', err);
  process.exit(1);
});

