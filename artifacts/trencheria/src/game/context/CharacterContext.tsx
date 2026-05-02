import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// Extended to include placeholder types for Yetis and Dogs
export type CharacterType = 'soldier' | 'goblin' | 'octopus' | 'nemoclaw' | 'chillhouse' | 'yeti' | 'dog';

interface CharacterContextValue {
  character: CharacterType;
  setCharacter: (c: CharacterType) => void;
}

const CharacterContext = createContext<CharacterContextValue>({
  character: 'goblin',
  setCharacter: () => {},
});

export function CharacterProvider({ children }: { children: ReactNode }) {
  const [character, setCharacterState] = useState<CharacterType>(() => {
    const saved = localStorage.getItem('selected-character');
    if (saved && isValidCharacterType(saved)) return saved as CharacterType;
    return 'goblin';
  });

  const setCharacter = useCallback((c: CharacterType) => {
    setCharacterState(c);
    localStorage.setItem('selected-character', c);
  }, []);

  return (
    <CharacterContext.Provider value={{ character, setCharacter }}>
      {children}
    </CharacterContext.Provider>
  );
}

export function useCharacter() {
  return useContext(CharacterContext);
}

function isValidCharacterType(s: string): boolean {
  return ['soldier', 'goblin', 'octopus', 'nemoclaw', 'chillhouse', 'yeti', 'dog'].includes(s);
}
