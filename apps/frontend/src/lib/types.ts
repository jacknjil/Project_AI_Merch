export interface Product {
  id: string;
  name: string;
  description?: string;
  price?: number;
  base_price?: number;
  active?: boolean;
  featured?: boolean;
  mockupImageUrl?: string | null;
  defaultAssetId?: string | null;
  niche?: string;
  style?: string;
  createdAt?: number;
  product_category?: string;
}

export interface Asset {
  id: string;
  title: string;
  niche?: string;
  style?: string;
  imageUrl: string;
  thumbUrl?: string;
  prompt?: string;
  source?: string;
  createdAt?: number;
  published?: boolean;
  productCategory?: string;
  printifyProductId?: string;
  printifyStatus?: string;
  mockupUrl?: string;
  mockupImages?: { src: string; label: string; isDefault: boolean }[];
  designGroupId?: string;
  printifyBlueprintId?: number;
  printifyPrintProviderId?: number;
  importSource?: 'printify-import';
  archivedAt?: number;
}
