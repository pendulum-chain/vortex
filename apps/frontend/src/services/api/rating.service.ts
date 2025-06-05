import { RatingEndpoints } from '@packages/shared';
import { apiRequest } from './api-client';

/**
 * Service for interacting with Rating API endpoints
 */
export class RatingService {
  private static readonly BASE_PATH = '/rating';

  /**
   * Store a user rating
   * @param rating The rating value (1-5)
   * @param walletAddress The user's wallet address
   * @returns Success message
   */
  static async storeRating(rating: number, walletAddress: string): Promise<RatingEndpoints.StoreRatingResponse> {
    const request: RatingEndpoints.StoreRatingRequest = {
      timestamp: new Date().toISOString(),
      rating,
      walletAddress,
    };
    return apiRequest<RatingEndpoints.StoreRatingResponse>('post', `${this.BASE_PATH}/create`, request);
  }
}
