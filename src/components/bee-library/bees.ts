const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const STORAGE_PATH = `${SUPABASE_URL}/storage/v1/object/public/avatars/bees`;

const BEE_IDS = [
  "alien-f","alien-m","angel-f","angel-m","archer-f","archer-m",
  "astronaut-f","astronaut-m","astronomer",
  "baker-f","baker-m","ballerina","basic","basketball-f","basketball-m",
  "beethoven","boxer-f","boxer-m",
  "chaplin","chef","cleopatra","climber-f","climber-m","clown",
  "cowboy-f","cowboy-m","cyclist-f","cyclist-m",
  "dancer-f","dancer-m","davinci","dentist-f","dentist-m",
  "devil-f","devil-m","dj-f","dj-m","doctor-f","doctor-m","dracula",
  "einstein","elvis","engineer-f","engineer-m","explorer",
  "fairy-f","fairy-m","farmer-f","farmer-m","firefighter",
  "frankenstein","frida",
  "gandalf","gardener-f","gardener-m","ghost-f","ghost-m",
  "gladiator","glam","golfer-f","golfer-m","groucho",
  "gymnast-f","gymnast-m",
  "hipster","hockey-f","hockey-m",
  "jobs","journalist-f","journalist-m",
  "judge-f","judge-m",
  "karate-f","karate-m","knight-f","knight-m",
  "lawyer-f","lawyer-m","librarian-f","librarian-m",
  "marilyn","marley","mechanic-f","mechanic-m",
  "merbee-f","merbee-m","model","monalisa","mozart",
  "napoleon","ninja-f","ninja-m","nurse-f","nurse-m",
  "painter-f","painter-m","pharaoh",
  "photographer-f","photographer-m","picasso",
  "pilot-f","pilot-m","pirate-f","pirate-m","plumber",
  "police-f","police-m","princess","punk",
  "queen",
  "rapper","robot-f","robot-m","rockstar","runner-f","runner-m",
  "sailor-f","sailor-m","samurai-f","samurai-m","santa",
  "scientist-f","scientist-m","shakespeare","sherlock",
  "skater-f","skater-m","skier-f","skier-m","soccer","spy","superhero",
  "surfer-f","surfer-m","swimmer-f","swimmer-m",
  "teacher-f","teacher-m","tennis-f","tennis-m","trump",
  "vampire-f","vampire-m","vangogh","vet-f","vet-m",
  "viking-f","viking-m",
  "wizard",
  "yoga-f",
] as const;

export type Bee = { id: string; src: string };

export const bees: Bee[] = BEE_IDS.map((id) => ({
  id,
  src: `${STORAGE_PATH}/bee-${id}.png`,
}));

export const beeById = (id: string | null | undefined): Bee | undefined =>
  bees.find((b) => b.id === id);
