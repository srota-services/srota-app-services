export interface DefaultLanguageSeed {
   name: string;
   code: string;
}

/** 23 official languages of India. */
export const DEFAULT_LANGUAGES: readonly DefaultLanguageSeed[] = [
   { name: 'Assamese', code: 'as' },
   { name: 'Bengali', code: 'bn' },
   { name: 'Bodo', code: 'brx' },
   { name: 'Dogri', code: 'doi' },
   { name: 'Gujarati', code: 'gu' },
   { name: 'Hindi', code: 'hi' },
   { name: 'Kannada', code: 'kn' },
   { name: 'Kashmiri', code: 'ks' },
   { name: 'Konkani', code: 'kok' },
   { name: 'Maithili', code: 'mai' },
   { name: 'Malayalam', code: 'ml' },
   { name: 'Manipuri', code: 'mni' },
   { name: 'Marathi', code: 'mr' },
   { name: 'Nepali', code: 'ne' },
   { name: 'Odia', code: 'or' },
   { name: 'Punjabi', code: 'pa' },
   { name: 'Sanskrit', code: 'sa' },
   { name: 'Santali', code: 'sat' },
   { name: 'Sindhi', code: 'sd' },
   { name: 'Tamil', code: 'ta' },
   { name: 'Telugu', code: 'te' },
   { name: 'Urdu', code: 'ur' },
   { name: 'English', code: 'en' },
] as const;

export const DEFAULT_LANGUAGE_CODE = 'bn';
