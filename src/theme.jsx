import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const THEME_KEY = 'trademarker.theme'
const ThemeContext = createContext(null)

const initialTheme = () => {
  try {
    return localStorage.getItem(THEME_KEY) || 'dark'
  } catch {
    return 'dark'
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {}
  }, [theme])

  const value = useMemo(() => ({
    theme,
    setTheme,
    toggleTheme: () => setTheme((current) => current === 'dark' ? 'light' : 'dark'),
  }), [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used within ThemeProvider')
  return value
}
