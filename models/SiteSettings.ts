import mongoose, { Schema, Model } from 'mongoose';

export interface ISiteSettingsDocument {
  key: string;
  heroTitle: string;
  heroSubtitle: string;
  heroCtaText: string;
  heroImage: string;
  brands: string[];
  lookbookPhotos: string[];
}

const SiteSettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    heroTitle: { type: String, default: 'VELIME' },
    heroSubtitle: { type: String, default: 'Une allure , toujours' },
    heroCtaText: { type: String, default: 'Découvrir' },
    heroImage: { type: String, default: '/images/hero-custom.jpg' },
    brands: {
      type: [String],
      default: [
        'ZARA', 'MANGO', 'SANDRO', 'MASSIMO DUTTI', 'COS', 'BA&SH',
        '& OTHER STORIES', 'ARKET', 'JACQUEMUS', 'ROUJE', 'SÉZANE', 'IRO PARIS',
      ],
    },
    lookbookPhotos: {
      type: [String],
      default: [
        '/images/p1.jpg',
        '/images/p2.jpg',
        '/images/p3.jpg',
        '/images/p4.jpg',
        '/images/p5.jpg',
        '/images/p6.jpg',
        '/images/p7.jpg',
      ],
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: any) => {
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export const SiteSettingsModel: Model<ISiteSettingsDocument> =
  mongoose.models.SiteSettings || mongoose.model<ISiteSettingsDocument>('SiteSettings', SiteSettingsSchema);
