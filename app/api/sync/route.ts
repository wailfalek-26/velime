import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ProductModel } from '@/models/Product';
import { CategoryModel } from '@/models/Category';
import { SiteSettingsModel } from '@/models/SiteSettings';

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const { products, categories, heroTitle, heroSubtitle, heroCtaText, heroImage, brands, lookbookPhotos } = await req.json();

    // 1. Sync Settings
    if (heroTitle || heroSubtitle || heroCtaText || heroImage || brands || lookbookPhotos) {
      const settingsPayload: any = {};
      if (heroTitle !== undefined) settingsPayload.heroTitle = heroTitle;
      if (heroSubtitle !== undefined) settingsPayload.heroSubtitle = heroSubtitle;
      if (heroCtaText !== undefined) settingsPayload.heroCtaText = heroCtaText;
      if (heroImage !== undefined) settingsPayload.heroImage = heroImage;
      if (brands !== undefined) settingsPayload.brands = brands;
      if (lookbookPhotos !== undefined) settingsPayload.lookbookPhotos = lookbookPhotos;

      await SiteSettingsModel.findOneAndUpdate(
        { key: 'default' },
        { $set: settingsPayload },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    // 2. Sync Categories (upsert each)
    if (Array.isArray(categories) && categories.length > 0) {
      const categoryOps = categories.map((cat: any) => ({
        updateOne: {
          filter: { id: cat.id },
          update: { $set: cat },
          upsert: true,
        },
      }));
      await CategoryModel.bulkWrite(categoryOps);
    }

    // 3. Sync Products (upsert each)
    if (Array.isArray(products) && products.length > 0) {
      const productOps = products.map((prod: any) => ({
        updateOne: {
          filter: { id: prod.id },
          update: { $set: prod },
          upsert: true,
        },
      }));
      await ProductModel.bulkWrite(productOps);
    }

    return NextResponse.json({
      success: true,
      message: 'MongoDB sync completed successfully',
      stats: {
        productsSynced: products?.length || 0,
        categoriesSynced: categories?.length || 0,
      },
    });
  } catch (error: any) {
    console.error('POST /api/sync error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Sync failed' },
      { status: 500 }
    );
  }
}

