import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { SiteSettingsModel } from '@/models/SiteSettings';

const DEFAULT_SETTINGS = {
  key: 'default',
  heroTitle: 'VELIME',
  heroSubtitle: 'Une allure , toujours',
  heroCtaText: 'Découvrir',
  heroImage: '/images/hero-custom.jpg',
  brands: [
    'ZARA', 'MANGO', 'SANDRO', 'MASSIMO DUTTI', 'COS', 'BA&SH',
    '& OTHER STORIES', 'ARKET', 'JACQUEMUS', 'ROUJE', 'SÉZANE', 'IRO PARIS'
  ],
  lookbookPhotos: [
    '/images/p1.jpg',
    '/images/p2.jpg',
    '/images/p3.jpg',
    '/images/p4.jpg',
    '/images/p5.jpg',
    '/images/p6.jpg',
    '/images/p7.jpg',
  ],
};

export async function GET() {
  try {
    await connectToDatabase();
    let settings = await SiteSettingsModel.findOne({ key: 'default' }).lean();

    if (!settings) {
      settings = await SiteSettingsModel.create(DEFAULT_SETTINGS);
    }

    return NextResponse.json({ success: true, settings });
  } catch (error: any) {
    console.error('GET /api/settings error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const data = await req.json();

    const updated = await SiteSettingsModel.findOneAndUpdate(
      { key: 'default' },
      { $set: data },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return NextResponse.json({ success: true, settings: updated });
  } catch (error: any) {
    console.error('POST /api/settings error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to update settings' },
      { status: 500 }
    );
  }
}

