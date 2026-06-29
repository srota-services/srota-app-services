import axios, { AxiosError } from 'axios';
import { SubscriptionTierLevel } from '@prisma/client';
import { config } from '../config/env';

export class SubscriptionClient {
   private baseUrl: string;

   constructor(baseUrl: string = config.AUTH_SERVICE_URL) {
      this.baseUrl = baseUrl.replace(/\/$/, '');
   }

   async getUserHighestActiveTier(_userId: string, accessToken: string): Promise<SubscriptionTierLevel | null> {
      try {
         const response = await axios.get<{ tier: SubscriptionTierLevel | null }>(
            `${this.baseUrl}/auth/subscriptions/me/tier`,
            {
               headers: { Authorization: `Bearer ${accessToken}` },
               timeout: 5000,
            }
         );
         const tier = response.data?.tier;
         return tier === null || tier === undefined ? null : tier;
      } catch (error) {
         if (axios.isAxiosError(error) && (error as AxiosError).response?.status === 401) {
            return null;
         }
         console.error('SubscriptionClient.getUserHighestActiveTier failed:', error);
         return null;
      }
   }
}

export const subscriptionClient = new SubscriptionClient();
