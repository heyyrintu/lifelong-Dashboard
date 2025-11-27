import { Injectable } from '@nestjs/common';
import { NormalizedCategory, ProductCategory } from '@prisma/client';

@Injectable()
export class CategoryNormalizerService {
  /**
   * Normalize customer group to a category enum based on keywords.
   * Rules are applied in order of priority: B2C > QUICK_COMMERCE > EBO > OFFLINE > E_COMMERCE > OTHERS
   */
  normalizeCategory(customerGroup: string | null | undefined): NormalizedCategory {
    if (!customerGroup) {
      return NormalizedCategory.OTHERS;
    }

    const normalized = customerGroup.toLowerCase().trim();

    // B2C - highest priority for specific patterns
    const b2cPatterns = [
      'decathlon',
      'flipkart(b2c)',
      'snapmint',
      'shopify',
      'tatacliq',
      'amazon b2c',
      'pepperfry',
      'b2c',
    ];
    if (b2cPatterns.some((pattern) => normalized.includes(pattern))) {
      return NormalizedCategory.B2C;
    }

    // QUICK_COMMERCE
    const quickCommercePatterns = ['blinkit', 'swiggy', 'bigbasket', 'zepto'];
    if (quickCommercePatterns.some((pattern) => normalized.includes(pattern))) {
      return NormalizedCategory.QUICK_COMMERCE;
    }

    // EBO
    const eboPatterns = ['store 2-lucknow', 'store3-zirakpur', 'store', 'ebo'];
    if (eboPatterns.some((pattern) => normalized.includes(pattern))) {
      return NormalizedCategory.EBO;
    }

    // OFFLINE
    const offlinePatterns = [
      'offline sales-b2b',
      'offline – gt',
      'offline - mt',
      'offline-gt',
      'offline-mt',
      'offline',
    ];
    if (offlinePatterns.some((pattern) => normalized.includes(pattern))) {
      return NormalizedCategory.OFFLINE;
    }

    // E_COMMERCE - generic patterns (check last to avoid false positives)
    const ecommercePatterns = ['amazon', 'flipkart', 'e-commerce', 'ecommerce'];
    if (ecommercePatterns.some((pattern) => normalized.includes(pattern))) {
      return NormalizedCategory.E_COMMERCE;
    }

    // Default fallback
    return NormalizedCategory.OTHERS;
  }

  /**
   * Convert enum value to display label
   */
  getCategoryLabel(category: NormalizedCategory): string {
    const labelMap: Record<NormalizedCategory, string> = {
      [NormalizedCategory.E_COMMERCE]: 'E-Commerce',
      [NormalizedCategory.OFFLINE]: 'Offline',
      [NormalizedCategory.QUICK_COMMERCE]: 'Quick-Commerce',
      [NormalizedCategory.EBO]: 'EBO',
      [NormalizedCategory.B2C]: 'B2C',
      [NormalizedCategory.OTHERS]: 'Others',
    };
    return labelMap[category] || 'Others';
  }

  /**
   * Normalize categoryRaw (Item Group) to ProductCategory enum
   * Based on the product type/item group from the Excel file
   */
  normalizeProductCategory(categoryRaw: string | null | undefined): ProductCategory {
    if (!categoryRaw) {
      return ProductCategory.OTHERS;
    }

    const normalized = categoryRaw.toLowerCase().trim();

    // EDEL - Edel products
    if (normalized.includes('edel') || normalized.includes('e-del')) {
      return ProductCategory.EDEL;
    }

    // HOME_AND_KITCHEN
    const homeKitchenPatterns = ['home', 'kitchen', 'cookware', 'appliance', 'mixer', 'grinder', 'blender', 'juicer', 'cooker', 'induction', 'kettle', 'toaster', 'iron', 'fan', 'heater', 'cooler'];
    if (homeKitchenPatterns.some((pattern) => normalized.includes(pattern))) {
      return ProductCategory.HOME_AND_KITCHEN;
    }

    // ELECTRONICS
    const electronicsPatterns = ['electronic', 'gadget', 'charger', 'cable', 'adapter', 'power bank', 'speaker', 'headphone', 'earphone'];
    if (electronicsPatterns.some((pattern) => normalized.includes(pattern))) {
      return ProductCategory.ELECTRONICS;
    }

    // HEALTH_AND_PERSONAL_CARE
    const healthPatterns = ['health', 'personal care', 'grooming', 'trimmer', 'shaver', 'massager', 'weighing', 'thermometer'];
    if (healthPatterns.some((pattern) => normalized.includes(pattern))) {
      return ProductCategory.HEALTH_AND_PERSONAL_CARE;
    }

    // AUTOMOTIVE_AND_TOOLS
    const autoToolsPatterns = ['auto', 'car', 'bike', 'tool', 'drill', 'screwdriver', 'wrench', 'hammer'];
    if (autoToolsPatterns.some((pattern) => normalized.includes(pattern))) {
      return ProductCategory.AUTOMOTIVE_AND_TOOLS;
    }

    // TOYS_AND_GAMES
    const toysPatterns = ['toy', 'game', 'play', 'kid', 'child'];
    if (toysPatterns.some((pattern) => normalized.includes(pattern))) {
      return ProductCategory.TOYS_AND_GAMES;
    }

    // BRAND_PRIVATE_LABEL
    const privateLabelPatterns = ['private label', 'brand', 'oem', 'white label'];
    if (privateLabelPatterns.some((pattern) => normalized.includes(pattern))) {
      return ProductCategory.BRAND_PRIVATE_LABEL;
    }

    // Default fallback
    return ProductCategory.OTHERS;
  }
}
