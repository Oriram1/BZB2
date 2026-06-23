// Auto-loaded manifest of all bee avatars.
// Vite's import.meta.glob inlines URLs at build time.

const modules = import.meta.glob("./assets/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

export type Bee = { id: string; src: string };

export const bees: Bee[] = Object.entries(modules)
  .map(([path, src]) => {
    const id = path.split("/").pop()!.replace(/^bee-/, "").replace(/\.png$/, "");
    return { id, src };
  })
  .sort((a, b) =>
    a.id === "basic" ? -1 : b.id === "basic" ? 1 : a.id.localeCompare(b.id),
  );

export const beeById = (id: string | null | undefined): Bee | undefined =>
  bees.find((b) => b.id === id);
