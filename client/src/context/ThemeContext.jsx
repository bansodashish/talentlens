import React, { createContext, useContext, useState, useEffect } from 'react';

export const THEMES = [
  {
    id: 'clean-slate',
    name: 'Clean Slate',
    description: 'Crisp white · signal blue',
    swatches: ['#f8fafc', '#ffffff', '#2563eb', '#14b8a6'],
    dark: false,
  },
  {
    id: 'glass-citrus',
    name: 'Glass Citrus',
    description: 'Airy glass · lime accent',
    swatches: ['#f7fee7', '#ffffff', '#365314', '#84cc16'],
    dark: false,
  },
  {
    id: 'mineral-mint',
    name: 'Mineral Mint',
    description: 'Quiet mint · deep teal',
    swatches: ['#f0fdfa', '#ffffff', '#0f766e', '#38bdf8'],
    dark: false,
  },
  {
    id: 'rose-quartz',
    name: 'Rose Quartz',
    description: 'Soft blush · berry red',
    swatches: ['#fff1f2', '#ffffff', '#be123c', '#fb7185'],
    dark: false,
  },
  {
    id: 'executive-graphite',
    name: 'Executive Graphite',
    description: 'Graphite ink · cobalt edge',
    swatches: ['#f8fafc', '#ffffff', '#1e40af', '#0f172a'],
    dark: false,
  },
  {
    id: 'slate-coral',
    name: 'Slate & Coral',
    description: 'Cool slate · warm coral',
    swatches: ['#f8fafc', '#ffffff', '#e85d4a', '#14b8a6'],
    dark: false,
  },
  {
    id: 'arctic-white',
    name: 'Arctic White',
    description: 'Icy white · cyan focus',
    swatches: ['#f0f9ff', '#ffffff', '#0891b2', '#22d3ee'],
    dark: false,
  },
  {
    id: 'midnight-orchid',
    name: 'Midnight Orchid',
    description: 'Ink dark · violet signal',
    swatches: ['#0f1020', '#17152e', '#8b5cf6', '#22d3ee'],
    dark: true,
  },
  {
    id: 'ember-noir',
    name: 'Ember Noir',
    description: 'Charcoal · ember orange',
    swatches: ['#111827', '#1f2937', '#f97316', '#2dd4bf'],
    dark: true,
  },
  {
    id: 'nord',
    name: 'Nord',
    description: 'Arctic grey · powder blue',
    swatches: ['#2e3440', '#3b4252', '#88c0d0', '#81a1c1'],
    dark: true,
  },
];

const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => localStorage.getItem('tl_theme') || 'clean-slate');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tl_theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
