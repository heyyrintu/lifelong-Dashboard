export enum ProductCategory {
  EDEL = 'EDEL',
  HOME_AND_KITCHEN = 'HOME_AND_KITCHEN',
  ELECTRONICS = 'ELECTRONICS',
  HEALTH_AND_PERSONAL_CARE = 'HEALTH_AND_PERSONAL_CARE',
  AUTOMOTIVE_AND_TOOLS = 'AUTOMOTIVE_AND_TOOLS',
  TOYS_AND_GAMES = 'TOYS_AND_GAMES',
  BRAND_PRIVATE_LABEL = 'BRAND_PRIVATE_LABEL',
  OTHERS = 'OTHERS',
}

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  [ProductCategory.EDEL]: 'Edel',
  [ProductCategory.HOME_AND_KITCHEN]: 'Home & Kitchen',
  [ProductCategory.ELECTRONICS]: 'Electronics',
  [ProductCategory.HEALTH_AND_PERSONAL_CARE]: 'Health & Personal Care',
  [ProductCategory.AUTOMOTIVE_AND_TOOLS]: 'Automotive & Tools',
  [ProductCategory.TOYS_AND_GAMES]: 'Toys & Games',
  [ProductCategory.BRAND_PRIVATE_LABEL]: 'Brand / Private Label',
  [ProductCategory.OTHERS]: 'Others',
};

export const PRODUCT_CATEGORY_ORDER: ProductCategory[] = [
  ProductCategory.EDEL,
  ProductCategory.HOME_AND_KITCHEN,
  ProductCategory.ELECTRONICS,
  ProductCategory.HEALTH_AND_PERSONAL_CARE,
  ProductCategory.AUTOMOTIVE_AND_TOOLS,
  ProductCategory.TOYS_AND_GAMES,
  ProductCategory.BRAND_PRIVATE_LABEL,
  ProductCategory.OTHERS,
];

export const PRODUCT_CATEGORY_LABELS_LIST = [
  'ALL',
  ...PRODUCT_CATEGORY_ORDER.map(cat => PRODUCT_CATEGORY_LABELS[cat]),
];

/**
 * Classify raw category string from Excel into ProductCategory enum
 * @param rawCategory - Raw category value from Excel Column M
 * @returns ProductCategory enum value
 */
export function classifyProductCategory(rawCategory: string | null | undefined): ProductCategory {
  const cat = (rawCategory ?? '')
    .toString()
    .toLowerCase()
    .trim();

  // Edel
  if (cat.includes('edel')) return ProductCategory.EDEL;

  // Home & Kitchen
  if (
    cat.includes('kitchen') ||
    cat.includes('dining') ||
    cat.includes('home') ||
    cat.includes('garden') ||
    cat.includes('lawn') ||
    cat.includes('pack')
  ) {
    return ProductCategory.HOME_AND_KITCHEN;
  }

  // Electronics
  if (
    cat.includes('electronic') ||
    cat.includes('innovation') ||
    cat.includes('smart') ||
    cat.includes('device') ||
    cat.includes('thrasio')
  ) {
    return ProductCategory.ELECTRONICS;
  }

  // Health & Personal Care
  if (
    cat.includes('health') ||
    cat.includes('care') ||
    cat.includes('fitness') ||
    cat.includes('sports') ||
    cat.includes('sport') ||
    cat.includes('baby')
  ) {
    return ProductCategory.HEALTH_AND_PERSONAL_CARE;
  }

  // Automotive & Tools
  if (
    cat.includes('mechanic') ||
    cat.includes('auto') ||
    cat.includes('spare') ||
    cat.includes('cycle') ||
    cat.includes('pca')
  ) {
    return ProductCategory.AUTOMOTIVE_AND_TOOLS;
  }

  // Toys & Games
  if (cat.includes('toy')) return ProductCategory.TOYS_AND_GAMES;

  // Brand / Private Label
  if (cat.includes('sha')) return ProductCategory.BRAND_PRIVATE_LABEL;

  // Others (default)
  return ProductCategory.OTHERS;
}

/**
 * Convert ProductCategory label string to enum value
 * @param label - Human-readable label (e.g., "Edel", "Home & Kitchen")
 * @returns ProductCategory enum value or null if not found
 */
export function productCategoryLabelToEnum(label: string): ProductCategory | null {
  for (const [enumVal, labelVal] of Object.entries(PRODUCT_CATEGORY_LABELS)) {
    if (labelVal === label) {
      return enumVal as ProductCategory;
    }
  }
  return null;
}

/**
 * Convert ProductCategory enum to human-readable label
 * @param category - ProductCategory enum value
 * @returns Human-readable label
 */
export function productCategoryEnumToLabel(category: ProductCategory): string {
  return PRODUCT_CATEGORY_LABELS[category] || 'Others';
}
