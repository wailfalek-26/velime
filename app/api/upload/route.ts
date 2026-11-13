import { NextRequest, NextResponse } from 'next/server';
import { uploadToR2, isR2Configured } from '@/lib/r2';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as 'products' | 'categories' | 'hero' | 'lookbook') || 'products';

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    if (!isR2Configured()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cloudflare R2 credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME) are not configured in .env.local',
        },
        { status: 500 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await uploadToR2({
      buffer,
      contentType: file.type || 'image/jpeg',
      folder,
      originalFileName: file.name,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, url: result.url, key: result.key });
  } catch (error: any) {
    console.error('Upload handler exception:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Server error during upload' },
      { status: 500 }
    );
  }
}

