import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type AccentPreset = {
  id: string;
  name: string;
  vars: Record<string, string>;
};

export const ACCENT_PRESETS: AccentPreset[] = [
  {
    id: 'slate-blue',
    name: 'Slate Blue',
    vars: {
      '--accent-50': '239 246 255',
      '--accent-100': '219 234 254',
      '--accent-200': '191 219 254',
      '--accent-300': '147 197 253',
      '--accent-400': '96 165 250',
      '--accent-500': '37 99 235',
      '--accent-600': '30 64 175',
      '--accent-700': '29 78 216',
      '--accent-800': '30 64 175',
      '--accent-900': '30 58 138',
    },
  },
  {
    id: 'emerald',
    name: 'Emerald',
    vars: {
      '--accent-50': '236 253 245',
      '--accent-100': '209 250 229',
      '--accent-200': '167 243 208',
      '--accent-300': '110 231 183',
      '--accent-400': '52 211 153',
      '--accent-500': '16 185 129',
      '--accent-600': '5 150 105',
      '--accent-700': '4 120 87',
      '--accent-800': '6 95 70',
      '--accent-900': '6 78 59',
    },
  },
  {
    id: 'amber',
    name: 'Amber',
    vars: {
      '--accent-50': '255 251 235',
      '--accent-100': '254 243 199',
      '--accent-200': '253 230 138',
      '--accent-300': '252 211 77',
      '--accent-400': '251 191 36',
      '--accent-500': '245 158 11',
      '--accent-600': '217 119 6',
      '--accent-700': '180 83 9',
      '--accent-800': '146 64 14',
      '--accent-900': '120 53 15',
    },
  },
  {
    id: 'rose',
    name: 'Rose',
    vars: {
      '--accent-50': '255 241 242',
      '--accent-100': '255 228 230',
      '--accent-200': '254 205 211',
      '--accent-300': '253 164 175',
      '--accent-400': '251 113 133',
      '--accent-500': '244 63 94',
      '--accent-600': '225 29 72',
      '--accent-700': '190 18 60',
      '--accent-800': '159 18 57',
      '--accent-900': '136 19 55',
    },
  },
  {
    id: 'teal',
    name: 'Teal',
    vars: {
      '--accent-50': '240 253 250',
      '--accent-100': '204 251 241',
      '--accent-200': '153 246 228',
      '--accent-300': '94 234 212',
      '--accent-400': '45 212 191',
      '--accent-500': '20 184 166',
      '--accent-600': '13 148 136',
      '--accent-700': '15 118 110',
      '--accent-800': '17 94 89',
      '--accent-900': '19 78 74',
    },
  },
];

type ThemeContextType = {
  accentId: string;
  setAccentId: (id: string) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const STORAGE_KEY = 'rca_app_accent';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [accentId, setAccentIdState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || 'slate-blue';
  });

  useEffect(() => {
    const preset = ACCENT_PRESETS.find(p => p.id === accentId) || ACCENT_PRESETS[0];
    const root = document.documentElement;
    Object.entries(preset.vars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
    localStorage.setItem(STORAGE_KEY, accentId);
  }, [accentId]);

  const setAccentId = (id: string) => setAccentIdState(id);

  return (
    <ThemeContext.Provider value={{ accentId, setAccentId }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
