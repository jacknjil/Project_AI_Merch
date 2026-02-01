export interface Product {
  id: string;
  name: string;
  description?: string;
  price?: number;
  base_price?: number; // Legacy field support
  active?: boolean;
  mockupImageUrl?: string | null;
  mockup_image_url?: string | null; // Legacy field support
  imageUrl?: string | null; // Legacy field support
  mockup_base_image?: string | null; // Legacy field support
  defaultAssetId?: string | null;
}
