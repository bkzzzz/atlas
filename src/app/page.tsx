import { CharacterStudio } from "@/components/character-studio";
import { LanguageProvider } from "@/components/language-provider";

// The page stays small: the interactive workspace lives in its own component.
export default function Home() {
  return (
    <LanguageProvider>
      <CharacterStudio />
    </LanguageProvider>
  );
}
