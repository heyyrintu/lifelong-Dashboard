import { Injectable } from '@nestjs/common';
import { NormalizedCategory } from '@prisma/client';

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
}
