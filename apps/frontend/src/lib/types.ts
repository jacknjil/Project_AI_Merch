export interface Product {
  id: string;
  name: string;
  description?: string;
  price?: number;
  base_price?: number;
  active?: boolean;
  featured?: boolean;
  mockupImageUrl?: string | null;
  mockup_image_url?: string | null;
  imageUrl?: string | null;
  mockup_base_image?: string | null;
  defaultAssetId?: string | null;
  createdAt?: number;
}
