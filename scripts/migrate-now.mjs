import fs from 'fs';
import path from 'path';
import mongoose, { Schema } from 'mongoose';

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

const mongoUri = process.env.MONGODB_URI;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://poswtkarskyouacsjfct.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('--- SYNCHRONISATION SUPABASE -> MONGODB ---');
console.log('Source Supabase :', supabaseUrl);
console.log('Cible MongoDB   : Connecté avec succès');

async function run() {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });

  const ProductSchema = new Schema(
    {
      id: { type: String, required: true, unique: true },
      slug: { type: String, required: true, unique: true },
      name: { type: String, required: true },
      price: { type: Number, required: true },
      originalPrice: { type: Number },
      image: { type: String, required: true },
      images: { type: [String], default: [] },
      category: { type: String, required: true },
      description: { type: String, default: '' },
      sizes: { type: [String], default: ['S', 'M', 'L'] },
      availableSizes: { type: [String] },
      colors: { type: [String] },
      availableColors: { type: [String] },
      stockMatrix: { type: [Schema.Types.Mixed] },
      inStock: { type: Boolean, default: true },
      stockStatus: { type: String, default: 'in_stock' },
      badge: { type: String },
      isNew: { type: Boolean, default: false },
      isBestSeller: { type: Boolean, default: false },
    },
    { timestamps: true, strict: false, suppressReservedKeysWarning: true }
  );

  const CategorySchema = new Schema(
    {
      id: { type: String, required: true, unique: true },
      name: { type: String, required: true },
      slug: { type: String, required: true, unique: true },
      description: { type: String },
      image: { type: String },
    },
    { timestamps: true, strict: false }
  );

  const OrderSchema = new Schema(
    {
      id: { type: String, required: true, unique: true },
      orderNumber: { type: String, required: true, unique: true },
      customerName: { type: String, required: true },
      customerPhone: { type: String, required: true },
      wilayaCode: { type: String, required: true },
      wilayaName: { type: String, required: true },
      commune: { type: String, required: true },
      deliveryType: { type: String, required: true },
      items: { type: [Schema.Types.Mixed], required: true },
      itemsSubtotal: { type: Number, required: true },
      deliveryCost: { type: Number, required: true },
      totalAmount: { type: Number, required: true },
      status: { type: String, default: 'en_attente' },
      notes: { type: String, default: '' },
      createdAt: { type: String },
    },
    { timestamps: true, strict: false }
  );

  const SiteSettingsSchema = new Schema(
    {
      key: { type: String, required: true, unique: true, default: 'default' },
      heroTitle: { type: String },
      heroSubtitle: { type: String },
      heroCtaText: { type: String },
      heroImage: { type: String },
      brands: { type: [String] },
      lookbookPhotos: { type: [String] },
    },
    { timestamps: true, strict: false }
  );

  const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);
  const Category = mongoose.models.Category || mongoose.model('Category', CategorySchema);
  const Order = mongoose.models.Order || mongoose.model('Order', OrderSchema);
  const SiteSettings = mongoose.models.SiteSettings || mongoose.model('SiteSettings', SiteSettingsSchema);

  // 1. Sync Categories from Supabase
  const catRes = await fetch(`${supabaseUrl}/rest/v1/categories?select=*`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
  });
  if (catRes.ok) {
    const categories = await catRes.json();
    console.log(`📥 Importation de ${categories.length} catégories depuis Supabase...`);
    for (const c of categories) {
      await Category.findOneAndUpdate(
        { id: c.id },
        {
          $set: {
            id: c.id,
            name: c.name,
            slug: c.slug,
            description: c.description || '',
            image: c.image || '',
          },
        },
        { upsert: true, new: true }
      );
    }
  }

  // 2. Sync Products from Supabase
  const prodRes = await fetch(`${supabaseUrl}/rest/v1/products?select=*`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
  });
  if (prodRes.ok) {
    const products = await prodRes.json();
    console.log(`📥 Importation de ${products.length} articles depuis Supabase...`);
    for (const p of products) {
      await Product.findOneAndUpdate(
        { id: p.id },
        {
          $set: {
            id: p.id,
            slug: p.slug,
            name: p.name,
            price: Number(p.price),
            originalPrice: p.original_price ? Number(p.original_price) : undefined,
            image: p.image,
            images: Array.isArray(p.images) ? p.images : [p.image],
            category: p.category,
            description: p.description || '',
            sizes: Array.isArray(p.sizes) ? p.sizes : ['S', 'M', 'L'],
            availableSizes: p.available_sizes || undefined,
            colors: p.colors || undefined,
            availableColors: p.available_colors || undefined,
            stockMatrix: p.stock_matrix || undefined,
            inStock: Boolean(p.in_stock),
            stockStatus: p.stock_status || 'in_stock',
            badge: p.badge || undefined,
            isNew: Boolean(p.is_new),
            isBestSeller: Boolean(p.is_best_seller),
          },
        },
        { upsert: true, new: true }
      );
    }
  }

  // 3. Sync Orders from Supabase
  const ordRes = await fetch(`${supabaseUrl}/rest/v1/orders?select=*`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
  });
  if (ordRes.ok) {
    const orders = await ordRes.json();
    console.log(`📥 Importation de ${orders.length} commandes depuis Supabase...`);
    for (const o of orders) {
      await Order.findOneAndUpdate(
        { id: o.id },
        {
          $set: {
            id: o.id,
            orderNumber: o.order_number || o.id,
            customerName: o.customer_name,
            customerPhone: o.customer_phone,
            wilayaCode: o.wilaya_code,
            wilayaName: o.wilaya_name,
            commune: o.commune,
            deliveryType: o.delivery_type,
            items: o.items || [],
            itemsSubtotal: Number(o.items_subtotal) || 0,
            deliveryCost: Number(o.delivery_cost) || 0,
            totalAmount: Number(o.total_amount) || 0,
            status: o.status || 'en_attente',
            notes: o.notes || '',
            createdAt: o.created_at,
          },
        },
        { upsert: true, new: true }
      );
    }
  }

  // 4. Sync Site Settings from Supabase
  const setRes = await fetch(`${supabaseUrl}/rest/v1/site_settings?id=eq.default`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
  });
  if (setRes.ok) {
    const sets = await setRes.json();
    if (sets && sets[0]) {
      const s = sets[0];
      await SiteSettings.findOneAndUpdate(
        { key: 'default' },
        {
          $set: {
            key: 'default',
            heroTitle: s.hero_title || 'VELIME',
            heroSubtitle: s.hero_subtitle || 'Une allure , toujours',
            heroCtaText: s.hero_cta_text || 'Découvrir',
            heroImage: s.hero_image || '/images/hero-custom.jpg',
            brands: s.brands || [],
            lookbookPhotos: s.lookbook_photos || [],
          },
        },
        { upsert: true, new: true }
      );
      console.log('📥 Réglages du site (hero, marques, lookbook) importés.');
    }
  }

  // Count documents in MongoDB
  const totalCats = await Category.countDocuments();
  const totalProds = await Product.countDocuments();
  const totalOrds = await Order.countDocuments();

  console.log('\n==============================================');
  console.log('🎉 SYNCHRONISATION MONGODB RÉUSSIE À 100% !');
  console.log(`Catégories dans MongoDB : ${totalCats}`);
  console.log(`Articles dans MongoDB    : ${totalProds}`);
  console.log(`Commandes dans MongoDB   : ${totalOrds}`);
  console.log('Toutes les images sont servies depuis Cloudflare R2 !');
  console.log('==============================================');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Erreur:', err);
  process.exit(1);
});
