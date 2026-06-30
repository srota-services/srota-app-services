import '../src/config/env';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { seedImagePlaceholderSpecs } from './imagePlaceholderSpecs.seed';
import { DEFAULT_LANGUAGES } from '../src/constants/defaultLanguages';

const prisma = new PrismaClient();

const DEFAULT_TAGS = ['Trending', 'New Releases'] as const;

const DEFAULT_GENRES = [
   'Poetry',
   'Novel',
   'Fiction',
   'Folklore',
   'Urban Fiction',
   'Crime',
   'Thriller',
   'Philosophy',
   'Religious',
] as const;

const DEFAULT_MOODS = [
   {
      name: 'Happy',
      icon: 'sun',
      hexcode: '#FFC83D',
      description: 'Uplifting stories filled with joy, warmth, and feel-good moments.',
      purpose:
         'Happy is designed for lifting your spirits and surrounding yourself with positivity. These audiobooks are curated to spark joy, lighten your mood, and remind you that good things happen — perfect for starting your day, recovering from a tough moment, or simply enjoying life with a smile.',
   },
   {
      name: 'Romantic',
      icon: 'heart',
      hexcode: '#E91E63',
      description: 'Tender tales of love, passion, and heartfelt connections.',
      purpose:
         'Romantic is designed for moments of love, intimacy, and emotional connection. These stories help you feel seen and understood, whether you are celebrating a relationship, dreaming of one, or simply savoring the beauty of human affection and devotion.',
   },
   {
      name: 'Emotional',
      icon: 'droplet',
      hexcode: '#5B8DEF',
      description: 'Deep, moving narratives that stir strong feelings and reflection.',
      purpose:
         'Emotional is designed for listeners who want stories that reach deep and let them feel fully. These audiobooks create space for catharsis, empathy, and self-reflection — helping you process your own feelings, connect with characters on a human level, and experience the power of a story that stays with you.',
   },
   {
      name: 'Suspenseful',
      icon: 'eye',
      hexcode: '#6A4C93',
      description: 'Tension-filled stories that keep you on the edge of your seat.',
      purpose:
         'Suspenseful is designed for those who crave tension, mystery, and the thrill of not knowing what comes next. These audiobooks keep your mind engaged and your heart racing — ideal for commutes, late-night listening, or anytime you want a gripping experience that pulls you in and refuses to let go.',
   },
   {
      name: 'Scary',
      icon: 'ghost',
      hexcode: '#8E44AD',
      description: 'Chilling horror and supernatural tales designed to unsettle and thrill.',
      purpose:
         'Scary is designed for a rush of adrenaline and the delicious chill of the unknown. These horror and supernatural stories help you escape the ordinary, confront fear in a safe space, and experience the excitement of stories that haunt, unsettle, and thrill long after you stop listening.',
   },
   {
      name: 'Funny',
      icon: 'laugh',
      hexcode: '#FFB703',
      description: 'Lighthearted and humorous stories meant to entertain and amuse.',
      purpose:
         'Funny is designed for when you need a laugh and a break from seriousness. These lighthearted audiobooks entertain, reduce stress, and brighten your day — whether you are unwinding after work, sharing a chuckle with family, or simply wanting stories that do not take themselves too seriously.',
   },
   {
      name: 'Calm',
      icon: 'wave',
      hexcode: '#38BDF8',
      description: 'Peaceful, soothing audiobooks perfect for relaxation and unwinding.',
      purpose:
         'Calm is designed for slowing down, breathing deeply, and finding peace. These soothing audiobooks help reduce anxiety, prepare you for restful sleep, and create a gentle backdrop for meditation, yoga, or quiet moments — giving your mind a quiet place to land.',
   },
   {
      name: 'Inspirational',
      icon: 'sparkle',
      hexcode: '#00B894',
      description: 'Motivating stories of growth, resilience, and positive transformation.',
      purpose:
         'Inspirational is designed for motivation, hope, and a push toward your best self. These stories of growth, resilience, and triumph help you believe in possibility, learn from others who overcame obstacles, and feel energized to take on your own challenges with renewed confidence.',
   },
   {
      name: 'Dark',
      icon: 'moon',
      hexcode: '#121212',
      description: 'Grim, brooding narratives exploring shadowy themes and moral complexity.',
      purpose:
         'Dark is designed for listeners drawn to complex, shadowy narratives and moral ambiguity. These brooding stories explore the harder sides of life — helping you engage with difficult themes, question assumptions, and experience fiction that is rich, layered, and unafraid to look at what lies beneath the surface.',
   },
   {
      name: 'Nostalgic',
      icon: 'videotape',
      hexcode: '#C17C3A',
      description: 'Stories that evoke memories of the past and a longing for simpler times.',
      purpose:
         'Nostalgic is designed for revisiting the past and feeling connected to simpler times. These stories evoke warm memories, cultural touchstones, and a gentle longing for what was — helping you reflect on your own journey, share memories with loved ones, and find comfort in tales rooted in tradition and remembrance.',
   },
] as const;

const DESC_ICONS_DIR = path.join(__dirname, '..', 'desc_icons');
const MOOD_ATTRIBUTES_DIR = path.join(__dirname, '..', 'mood_attributes');
const EXPECTED_MOOD_COUNT = 10;
const EXPECTED_ATTRIBUTES_PER_MOOD = 3;

const ATTRIBUTE_DESCRIPTION_OVERRIDES: Record<string, string> = {
   cheerful: 'Bright and cheerful stories that lift the spirit.',
   'feel-good': 'Feel-good narratives that leave you smiling.',
   uplifting: 'Uplifting tales that inspire positivity.',
   passionate: 'Passionate stories filled with deep emotion and desire.',
   soft: 'Soft, tender moments of warmth and affection.',
   loving: 'Loving narratives that celebrate connection and care.',
   deep: 'Deep, introspective stories that resonate on a personal level.',
   heartfelt: 'Heartfelt narratives that touch the soul.',
   moving: 'Moving tales that stay with you long after listening.',
   tense: 'Tense storytelling that keeps you on edge.',
   gripping: 'Gripping plots that are hard to put down.',
   mysterious: 'Mysterious narratives full of intrigue and unanswered questions.',
   chilling: 'Chilling tales that send shivers down your spine.',
   fearful: 'Fearful atmospheres that unsettle and thrill.',
   haunted: 'Haunted stories steeped in dread and the supernatural.',
   witty: 'Witty humor that delivers clever laughs.',
   playful: 'Playful storytelling with a light, fun tone.',
   light: 'Light-hearted narratives perfect for easy listening.',
   relaxing: 'Relaxing stories ideal for winding down.',
   mindful: 'Mindful listening that encourages peace and presence.',
   hopeful: 'Hopeful stories that shine a light on better days.',
   empowering: 'Empowering narratives that build confidence and courage.',
   motivating: 'Motivating tales that push you to reach higher.',
   brooding: 'Brooding narratives with a heavy, shadowy atmosphere.',
   intense: 'Intense storytelling that explores the darker side of human nature.',
   warm: 'Warm stories that feel like a comforting trip down memory lane.',
   retro: 'Retro vibes that evoke a bygone era.',
   'memory-filled': 'Memory-filled narratives rich with sentiment and reflection.',
};

function getSvgStem(filename: string): string {
   return path.basename(filename, path.extname(filename));
}

function toReadableLabel(iconStem: string): string {
   return iconStem
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('-');
}

function generateAttributeDescription(iconStem: string): string {
   const override = ATTRIBUTE_DESCRIPTION_OVERRIDES[iconStem];
   if (override) {
      return override;
   }

   const label = toReadableLabel(iconStem);
   return `${label} stories that capture this mood's character.`;
}

function readSvgStemsFromDir(dirPath: string): string[] {
   if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
   }

   return fs
      .readdirSync(dirPath)
      .filter(file => file.toLowerCase().endsWith('.svg'))
      .map(getSvgStem)
      .sort((a, b) => a.localeCompare(b));
}

function readDescIconStems(): Map<string, string> {
   const stems = readSvgStemsFromDir(DESC_ICONS_DIR);
   const stemByLowercaseName = new Map<string, string>();

   for (const stem of stems) {
      stemByLowercaseName.set(stem.toLowerCase(), stem);
   }

   return stemByLowercaseName;
}

function readMoodAttributeStems(): Map<string, string[]> {
   if (!fs.existsSync(MOOD_ATTRIBUTES_DIR)) {
      throw new Error(`Directory not found: ${MOOD_ATTRIBUTES_DIR}`);
   }

   const moodFolders = fs
      .readdirSync(MOOD_ATTRIBUTES_DIR, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort((a, b) => a.localeCompare(b));

   const attributesByMood = new Map<string, string[]>();

   for (const folderName of moodFolders) {
      const folderPath = path.join(MOOD_ATTRIBUTES_DIR, folderName);
      const stems = readSvgStemsFromDir(folderPath);

      if (stems.length !== EXPECTED_ATTRIBUTES_PER_MOOD) {
         throw new Error(
            `Expected ${EXPECTED_ATTRIBUTES_PER_MOOD} SVG files in ${folderPath}, found ${stems.length}`
         );
      }

      attributesByMood.set(folderName, stems);
   }

   return attributesByMood;
}

async function seedTags(): Promise<void> {
   console.log('Seeding tags...');

   for (const tagName of DEFAULT_TAGS) {
      const tag = await prisma.tag.upsert({
         where: { name: tagName },
         update: {},
         create: { name: tagName },
      });
      console.log(`  ${tag.name}`);
   }
}

async function seedGenres(): Promise<void> {
   console.log('Seeding genres...');

   for (const genreName of DEFAULT_GENRES) {
      const genre = await prisma.genre.upsert({
         where: { name: genreName },
         update: {},
         create: { name: genreName },
      });
      console.log(`  ${genre.name}`);
   }
}

async function seedLanguages(): Promise<void> {
   console.log('Seeding languages...');

   for (const language of DEFAULT_LANGUAGES) {
      const row = await prisma.language.upsert({
         where: { code: language.code },
         update: { name: language.name },
         create: { name: language.name, code: language.code },
      });
      console.log(`  ${row.name} (${row.code})`);
   }
}

async function seedMoods(): Promise<void> {
   console.log('Seeding moods...');

   for (const mood of DEFAULT_MOODS) {
      const created = await prisma.mood.upsert({
         where: { name: mood.name },
         update: {
            icon: mood.icon,
            hexcode: mood.hexcode,
            description: mood.description,
            purpose: mood.purpose,
         },
         create: {
            name: mood.name,
            icon: mood.icon,
            descriptionIcon: '',
            hexcode: mood.hexcode,
            description: mood.description,
            purpose: mood.purpose,
         },
      });

      console.log(`  ${created.name} (${created.icon}, ${created.hexcode})`);
   }
}

async function seedMoodAssets(): Promise<void> {
   console.log('Seeding mood assets from local folders...');

   const moods = await prisma.mood.findMany({ orderBy: { name: 'asc' } });
   if (moods.length !== EXPECTED_MOOD_COUNT) {
      throw new Error(
         `Expected ${EXPECTED_MOOD_COUNT} moods in the database, found ${moods.length}.`
      );
   }

   const descIconStems = readDescIconStems();
   const attributeStemsByMood = readMoodAttributeStems();

   if (descIconStems.size !== EXPECTED_MOOD_COUNT) {
      throw new Error(
         `Expected ${EXPECTED_MOOD_COUNT} SVG files in desc_icons/, found ${descIconStems.size}`
      );
   }

   if (attributeStemsByMood.size !== EXPECTED_MOOD_COUNT) {
      throw new Error(
         `Expected ${EXPECTED_MOOD_COUNT} mood subfolders in mood_attributes/, found ${attributeStemsByMood.size}`
      );
   }

   const moodByName = new Map(moods.map(mood => [mood.name, mood]));
   const matchedDescIcons = new Set<string>();

   for (const mood of moods) {
      const descIconStem = descIconStems.get(mood.name.toLowerCase());
      if (!descIconStem) {
         throw new Error(`No desc_icons file found for mood "${mood.name}"`);
      }

      matchedDescIcons.add(mood.name.toLowerCase());

      const attributeStems = attributeStemsByMood.get(mood.name);
      if (!attributeStems) {
         throw new Error(`No mood_attributes subfolder found for mood "${mood.name}"`);
      }

      await prisma.mood.update({
         where: { id: mood.id },
         data: { descriptionIcon: descIconStem },
      });

      await prisma.moodAttribute.deleteMany({ where: { moodId: mood.id } });
      await prisma.moodAttribute.createMany({
         data: attributeStems.map(iconStem => ({
            moodId: mood.id,
            icon: iconStem,
            description: generateAttributeDescription(iconStem),
         })),
      });

      console.log(`  ${mood.name} → description_icon: ${descIconStem}, ${attributeStems.length} attributes`);
   }

   for (const [stemLower] of descIconStems) {
      if (!matchedDescIcons.has(stemLower)) {
         throw new Error(`desc_icons file "${stemLower}.svg" has no matching mood in the database`);
      }
   }

   for (const [folderName] of attributeStemsByMood) {
      if (!moodByName.has(folderName)) {
         throw new Error(`mood_attributes folder "${folderName}" has no matching mood in the database`);
      }
   }
}

async function main(): Promise<void> {
   console.log('Starting database seeding...');

   await seedTags();
   await seedGenres();
   await seedLanguages();
   await seedMoods();
   await seedMoodAssets();
   await seedImagePlaceholderSpecs(prisma);

   console.log('Database seeding completed.');
}

main()
   .catch((error) => {
      console.error('Database seeding failed:', error);
      process.exit(1);
   })
   .finally(async () => {
      await prisma.$disconnect();
   });
