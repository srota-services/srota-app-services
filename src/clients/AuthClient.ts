import axios, { AxiosError } from 'axios';
import { config } from '../config/env';

export interface AuthUserInfo {
   role: string;
   email: string;
}

export interface AuthAuthorInfo {
   id: string;
   slug: string;
   userId: string;
}

export interface AuthAuthorCatalogInfo {
   id: string;
   slug: string;
   userId: string;
   firstName?: string | null;
   lastName?: string | null;
   avatar?: string | null;
   imageAssets?: Record<string, string>;
}

export interface AuthPublicUserProfile {
   userId: string;
   username: string;
   avatar?: string;
   imageAssets?: Record<string, string>;
}

export interface AuthOrganizationCatalogInfo {
   id: string;
   name: string;
   slug: string;
   description?: string | null;
   image?: string | null;
   imageAssets?: Record<string, string>;
   preferredGenre?: string | null;
   websiteUrl?: string | null;
   teamSize?: string | null;
   discoverable?: boolean;
}

export interface AuthMembershipInfo {
   role: string;
}

export class AuthClient {
   private baseUrl: string;

   constructor(baseUrl: string = config.AUTH_SERVICE_URL) {
      this.baseUrl = baseUrl.replace(/\/$/, '');
   }

   private authHeaders(accessToken: string): { Authorization: string } {
      return { Authorization: `Bearer ${accessToken}` };
   }

   async getUserById(userId: string, accessToken: string): Promise<AuthUserInfo | null> {
      try {
         const response = await axios.get<{ role: string; email: string }>(
            `${this.baseUrl}/auth/user/${userId}`,
            {
               headers: this.authHeaders(accessToken),
               timeout: 5000,
            },
         );

         const role = response.data?.role;
         const email = response.data?.email;

         if (!role || !email) {
            return null;
         }

         return { role, email };
      } catch (error) {
         if (axios.isAxiosError(error) && (error as AxiosError).response?.status === 404) {
            return null;
         }
         console.error('AuthClient.getUserById failed:', error);
         throw error;
      }
   }

   async getAuthorByUserId(userId: string, accessToken: string): Promise<AuthAuthorInfo | null> {
      try {
         const response = await axios.get<{ author: AuthAuthorInfo }>(
            `${this.baseUrl}/auth/authors/me`,
            {
               headers: this.authHeaders(accessToken),
               timeout: 5000,
            },
         );

         const author = response.data?.author;
         if (!author?.id || author.userId !== userId) {
            return null;
         }

         return author;
      } catch (error) {
         if (axios.isAxiosError(error) && (error as AxiosError).response?.status === 404) {
            return null;
         }
         console.error('AuthClient.getAuthorByUserId failed:', error);
         throw error;
      }
   }

   async getAuthorCatalogById(authorId: string, accessToken: string): Promise<AuthAuthorCatalogInfo | null> {
      try {
         const response = await axios.get<{ author: AuthAuthorCatalogInfo }>(
            `${this.baseUrl}/auth/catalog/authors/${authorId}`,
            {
               headers: this.authHeaders(accessToken),
               timeout: 5000,
            },
         );
         return response.data?.author ?? null;
      } catch (error) {
         if (axios.isAxiosError(error) && (error as AxiosError).response?.status === 404) {
            return null;
         }
         console.error('AuthClient.getAuthorCatalogById failed:', error);
         throw error;
      }
   }

   async getOrganizationCatalogById(
      organizationId: string,
      accessToken: string,
   ): Promise<AuthOrganizationCatalogInfo | null> {
      try {
         const response = await axios.get<{ organization: AuthOrganizationCatalogInfo }>(
            `${this.baseUrl}/auth/catalog/organizations/${organizationId}`,
            {
               headers: this.authHeaders(accessToken),
               timeout: 5000,
            },
         );
         return response.data?.organization ?? null;
      } catch (error) {
         if (axios.isAxiosError(error) && (error as AxiosError).response?.status === 404) {
            return null;
         }
         console.error('AuthClient.getOrganizationCatalogById failed:', error);
         throw error;
      }
   }

   async getPublicUserProfile(userId: string, accessToken: string): Promise<AuthPublicUserProfile | null> {
      try {
         const response = await axios.get<{ profile: AuthPublicUserProfile }>(
            `${this.baseUrl}/auth/users/${userId}/profile`,
            {
               headers: this.authHeaders(accessToken),
               timeout: 5000,
            },
         );
         return response.data?.profile ?? null;
      } catch (error) {
         if (axios.isAxiosError(error) && (error as AxiosError).response?.status === 404) {
            return null;
         }
         console.error('AuthClient.getPublicUserProfile failed:', error);
         throw error;
      }
   }

   async getMembership(
      organizationId: string,
      accessToken: string,
   ): Promise<AuthMembershipInfo | null> {
      try {
         const response = await axios.get<{ membership: { role: string } }>(
            `${this.baseUrl}/auth/organizations/${organizationId}/members/me`,
            {
               headers: this.authHeaders(accessToken),
               timeout: 5000,
            },
         );

         const role = response.data?.membership?.role;
         if (!role) {
            return null;
         }

         return { role };
      } catch (error) {
         if (axios.isAxiosError(error) && (error as AxiosError).response?.status === 404) {
            return null;
         }
         console.error('AuthClient.getMembership failed:', error);
         throw error;
      }
   }

   async getOrganizationMembershipsForUser(
      accessToken: string,
   ): Promise<Array<{ organizationId: string; role: string }>> {
      try {
         const response = await axios.get<{ memberships: Array<{ organizationId: string; role: string }> }>(
            `${this.baseUrl}/auth/users/me/organization-memberships`,
            {
               headers: this.authHeaders(accessToken),
               timeout: 5000,
            },
         );
         return response.data?.memberships ?? [];
      } catch (error) {
         console.error('AuthClient.getOrganizationMembershipsForUser failed:', error);
         throw error;
      }
   }

   async isAuthorLinkedToOrganization(
      authorId: string,
      organizationId: string,
      accessToken: string,
   ): Promise<boolean> {
      try {
         const response = await axios.get<{ linked: boolean }>(
            `${this.baseUrl}/auth/authors/${authorId}/organizations/${organizationId}/link`,
            {
               headers: this.authHeaders(accessToken),
               timeout: 5000,
            },
         );
         return Boolean(response.data?.linked);
      } catch (error) {
         if (axios.isAxiosError(error) && (error as AxiosError).response?.status === 404) {
            return false;
         }
         console.error('AuthClient.isAuthorLinkedToOrganization failed:', error);
         throw error;
      }
   }
}

export const authClient = new AuthClient();
