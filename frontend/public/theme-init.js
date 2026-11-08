(() => {
  const root = document.documentElement
  const themes = ['indigo', 'forest', 'saffron']
  let mode = 'system'
  let theme = 'indigo'

  try {
    const savedMode = localStorage.getItem('dealtracker:appearance')
    const savedTheme = localStorage.getItem('dealtracker:color-theme')
    if (savedMode === 'light' || savedMode === 'dark') mode = savedMode
    if (themes.includes(savedTheme)) theme = savedTheme
  } catch {
    // The defaults still allow the page to render when browser storage is blocked.
  }

  root.setAttribute('data-theme', theme)
  if (mode === 'system') root.removeAttribute('data-mode')
  else root.setAttribute('data-mode', mode)
})()
