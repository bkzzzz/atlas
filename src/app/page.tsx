import { CharacterStudio } from "@/components/character-studio";

// The page stays small: the interactive workspace lives in its own component.
export default function Home() {
  return <CharacterStudio developerMode={process.env.NODE_ENV === "development"} />;
}
