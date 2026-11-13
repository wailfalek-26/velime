import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ProductModel } from '@/models/Product';
import { CategoryModel } from '@/models/Category';
import { OrderModel } from '@/models/Order';
import { SiteSettingsModel } from '@/models/SiteSettings';
import { supabase, mapDbToProduct } from '@/lib/supabase';
import { uploadToR2, isR2Configured } from '@/lib/r2';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Allow 5 minutes for images migration

async function transferImageToR2(
  url: string,
  folder: 'products' | 'categories' | 'hero' | 'lookbook'
): Promise<string> {
  if (!url || typeof url !== 'string') return url;

  // If already on Cloudflare R2, don't re-upload
  if (url.includes('.r2.dev') || url.includes('r2.cloudflarestorage.com')) {
    return url;
  }

  // Only download remote HTTP/HTTPS images (e.g. from Supabase Storage or external CDN)
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return url;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`Could not download image from ${url} (${res.status})`);
      return url;
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = res.headers.get('content-type') || 'image/jpeg';

    const parsed = new URL(url);
    const rawFileName = parsed.pathname.split('/').pop() || 'image.webp';

    const uploadRes = await uploadToR2({
      buffer,
      contentType,
      folder,
      originalFileName: rawFileName,
    });

    if (uploadRes.success && uploadRes.url) {
      return uploadRes.url;
    }
  } catch (err) {
    console.warn(`Error transferring image ${url} to R2:`, err);
  }

  return url;
}

export async function GET() {
  try {
    await connectToDatabase();

    const report: any = {
      r2Configured: isR2Configured(),
      productsMigrated: 0,
      categoriesMigrated: 0,
      ordersMigrated: 0,
      settingsMigrated: false,
      imagesTransferredToR2: 0,
    };

    // ============================================================
    // 1. MIGRATE SUPABASE STORAGE BUCKET DIRECTLY TO R2
    // ============================================================
    if (supabase && isR2Configured()) {
      const storageFolders: Array<'products' | 'categories' | 'hero' | 'lookbook'> = [
        'products',
        'categories',
        'hero',
        'lookbook',
      ];

      for (const folder of storageFolders) {
        try {
          const { data: files } = await supabase.storage.from('velime-media').list(folder, { limit: 100 });
          if (files && files.length > 0) {
            for (const file of files) {
              if (file.name === '.emptyFolderPlaceholder' || !file.name) continue;
              const { data: pubData } = supabase.storage.from('velime-media').getPublicUrl(`${folder}/${file.name}`);
              if (pubData?.publicUrl) {
                const newUrl = await transferImageToR2(pubData.publicUrl, folder);
                if (newUrl !== pubData.publicUrl) {
                  report.imagesTransferredToR2++;
                }
              }
            }
          }
        } catch (stErr) {
          console.warn(`Supabase Storage scan notice for ${folder}:`, stErr);
        }
      }
    }

    // ============================================================
    // 2. MIGRATE CATEGORIES + TRANSFER CATEGORY IMAGES
    // ============================================================
    if (supabase) {
      const { data: categoriesData } = await supabase.from('categories').select('*');
      if (categoriesData && categoriesData.length > 0) {
        for (const cat of categoriesData) {
          let catImage = cat.image || '';
          if (catImage && isR2Configured()) {
            const r2Img = await transferImageToR2(catImage, 'categories');
            if (r2Img !== catImage) {
              catImage = r2Img;
              report.imagesTransferredToR2++;
            }
          }

          await CategoryModel.findOneAndUpdate(
            { id: cat.id },
            {
              $set: {
                id: cat.id,
                name: cat.name,
                slug: cat.slug,
                description: cat.description || '',
                image: catImage,
              },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        }
        report.categoriesMigrated = categoriesData.length;
      }
    }

    // ============================================================
    // 3. MIGRATE PRODUCTS + TRANSFER PRODUCT IMAGES
    // ============================================================
    if (supabase) {
      const { data: productsData } = await supabase.from('products').select('*');
      if (productsData && productsData.length > 0) {
        for (const prod of productsData) {
          const mapped = mapDbToProduct(prod);

          if (isR2Configured()) {
            // Main image
            if (mapped.image) {
              const r2Main = await transferImageToR2(mapped.image, 'products');
              if (r2Main !== mapped.image) {
                mapped.image = r2Main;
                report.imagesTransferredToR2++;
              }
            }

            // Gallery images
            if (Array.isArray(mapped.images) && mapped.images.length > 0) {
              const updatedImages = [];
              for (const img of mapped.images) {
                const r2Img = await transferImageToR2(img, 'products');
                updatedImages.push(r2Img);
                if (r2Img !== img) {
                  report.imagesTransferredToR2++;
                }
              }
              mapped.images = updatedImages;
            }
          }

          await ProductModel.findOneAndUpdate(
            { id: mapped.id },
            { $set: mapped },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        }
        report.productsMigrated = productsData.length;
      }
    }

    // ============================================================
    // 4. MIGRATE ORDERS
    // ============================================================
    if (supabase) {
      const { data: ordersData } = await supabase.from('orders').select('*');
      if (ordersData && ordersData.length > 0) {
        for (const ord of ordersData) {
          await OrderModel.findOneAndUpdate(
            { id: ord.id },
            {
              $set: {
                id: ord.id,
                orderNumber: ord.order_number || ord.id,
                customerName: ord.customer_name,
                customerPhone: ord.customer_phone,
                wilayaCode: ord.wilaya_code,
                wilayaName: ord.wilaya_name,
                commune: ord.commune,
                deliveryType: ord.delivery_type,
                items: ord.items || [],
                itemsSubtotal: Number(ord.items_subtotal) || 0,
                deliveryCost: Number(ord.delivery_cost) || 0,
                totalAmount: Number(ord.total_amount) || 0,
                status: ord.status || 'en_attente',
                notes: ord.notes || '',
                createdAt: ord.created_at || new Date().toISOString(),
              },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        }
        report.ordersMigrated = ordersData.length;
      }
    }

    // ============================================================
    // 5. MIGRATE SITE SETTINGS + HERO / LOOKBOOK IMAGES
    // ============================================================
    if (supabase) {
      const { data: settingsData } = await supabase
        .from('site_settings')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();

      if (settingsData) {
        let heroImage = settingsData.hero_image || '/images/hero-custom.jpg';
        let lookbookPhotos = Array.isArray(settingsData.lookbook_photos) ? settingsData.lookbook_photos : [];

        if (isR2Configured()) {
          if (heroImage) {
            const r2Hero = await transferImageToR2(heroImage, 'hero');
            if (r2Hero !== heroImage) {
              heroImage = r2Hero;
              report.imagesTransferredToR2++;
            }
          }

          if (lookbookPhotos.length > 0) {
            const updatedLookbook = [];
            for (const photo of lookbookPhotos) {
              const r2Photo = await transferImageToR2(photo, 'lookbook');
              updatedLookbook.push(r2Photo);
              if (r2Photo !== photo) {
                report.imagesTransferredToR2++;
              }
            }
            lookbookPhotos = updatedLookbook;
          }
        }

        await SiteSettingsModel.findOneAndUpdate(
          { key: 'default' },
          {
            $set: {
              key: 'default',
              heroTitle: settingsData.hero_title || 'VELIME',
              heroSubtitle: settingsData.hero_subtitle || 'Une allure , toujours',
              heroCtaText: settingsData.hero_cta_text || 'Découvrir',
              heroImage,
              brands: settingsData.brands || [],
              lookbookPhotos,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        report.settingsMigrated = true;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Migration complète vers MongoDB et Cloudflare R2 terminée avec succès !',
      report,
    });
  } catch (error: any) {
    console.error('Migration error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Migration failed' },
      { status: 500 }
    );
  }
}
