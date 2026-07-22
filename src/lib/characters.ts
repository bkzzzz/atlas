// This is the data shape the browser receives from the character API.
// Keeping it separate prevents UI components from importing server-only Prisma code.
export type Character = {
  id: string;
  name: string;
  description: string;
  personality: string;
  species: string;
  createdAt: string;
};

export type CreateCharacterInput = Omit<Character, "id" | "createdAt">;
