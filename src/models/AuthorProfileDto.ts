export interface DiscoverableAuthorDto {
   authorId: string;
   slug: string;
   firstName?: string | null;
   lastName?: string | null;
   avatar?: string | null;
   discoverable: boolean;
   imageAssets?: Record<string, string>;
}

export interface AuthorProfileDto {
   id: string;
   authorId: string;
   avatar?: string | null;
   discoverable?: boolean;
   imageAssets?: Record<string, string>;
   createdAt: Date;
   updatedAt: Date;
}

export interface UpdateAuthorProfileDto {
   avatar?: string | null;
   discoverable?: boolean;
}

export function toAuthorProfileDto(profile: {
   id: string;
   authorId: string;
   avatar: string | null;
   discoverable: boolean;
   createdAt: Date;
   updatedAt: Date;
}): AuthorProfileDto {
   return {
      id: profile.id,
      authorId: profile.authorId,
      avatar: profile.avatar,
      discoverable: profile.discoverable,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
   };
}
