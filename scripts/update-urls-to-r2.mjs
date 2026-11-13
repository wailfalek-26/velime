import fs from 'fs';
import path from 'path';

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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://poswtkarskyouacsjfct.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const r2PublicUrl = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://pub-58f10aa79a8d494ab12dad618a158e60.r2.dev').replace(/\/$/, '');
const supabaseStorageBase = `${supabaseUrl}/storage/v1/object/public/velime-media`;

console.log('--- MISE À JOUR DES LIENS VERS CLOUDFLARE R2 ---');
console.log('Ancienne base :', supabaseStorageBase);
console.log('Nouvelle base :', r2PublicUrl);

function convertUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.includes(supabaseStorageBase)) {
    return url.replace(supabaseStorageBase, r2PublicUrl);
  }
  return url;
}

async function run() {
  // 1. Categories
  const catRes = await fetch(`${supabaseUrl}/rest/v1/categories?select=*`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
  });
  if (catRes.ok) {
    const categories = await catRes.json();
    for (const cat of categories) {
      if (cat.image && cat.image.includes(supabaseStorageBase)) {
        const newImg = convertUrl(cat.image);
        await fetch(`${supabaseUrl}/rest/v1/categories?id=eq.${encodeURIComponent(cat.id)}`, {
          method: 'PATCH',
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
          },
          body: JSON.stringify({ image: newImg })
        });
        console.log(`Catégorie « ${cat.name} » mise à jour avec R2.`);
      }
    }
  }

  // 2. Products
  const prodRes = await fetch(`${supabaseUrl}/rest/v1/products?select=*`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
  });
  if (prodRes.ok) {
    const products = await prodRes.json();
    for (const prod of products) {
      let updated = false;
      const newMain = convertUrl(prod.image);
      if (newMain !== prod.image) updated = true;

      let newGallery = prod.images;
      if (Array.isArray(prod.images)) {
        newGallery = prod.images.map(convertUrl);
        if (JSON.stringify(newGallery) !== JSON.stringify(prod.images)) {
          updated = true;
        }
      }

      if (updated) {
        await fetch(`${supabaseUrl}/rest/v1/products?id=eq.${encodeURIComponent(prod.id)}`, {
          method: 'PATCH',
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
          },
          body: JSON.stringify({
            image: newMain,
            images: newGallery,
            updated_at: new Date().toISOString()
          })
        });
        console.log(`Article « ${prod.name} » mis à jour avec les liens R2.`);
      }
    }
  }

  // 3. Site Settings
  const setRes = await fetch(`${supabaseUrl}/rest/v1/site_settings?id=eq.default`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
  });
  if (setRes.ok) {
    const sets = await setRes.json();
    if (sets && sets[0]) {
      const s = sets[0];
      let updated = false;
      const newHero = convertUrl(s.hero_image);
      if (newHero !== s.hero_image) updated = true;

      let newLookbook = s.lookbook_photos;
      if (Array.isArray(s.lookbook_photos)) {
        newLookbook = s.lookbook_photos.map(convertUrl);
        if (JSON.stringify(newLookbook) !== JSON.stringify(s.lookbook_photos)) {
          updated = true;
        }
      }

      if (updated) {
        await fetch(`${supabaseUrl}/rest/v1/site_settings?id=eq.default`, {
          method: 'PATCH',
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
          },
          body: JSON.stringify({
            hero_image: newHero,
            lookbook_photos: newLookbook,
            updated_at: new Date().toISOString()
          })
        });
        console.log('Site settings mis à jour avec les liens R2.');
      }
    }
  }

  console.log('--- TOUS LES LIENS SONT DÉSORMAIS SUR CLOUDFLARE R2 ! ---');
}

run().catch(console.error);

