(() => {
  const root = document.documentElement
  const themes = ['sky', 'indigo', 'forest', 'saffron']
  let mode = 'system'
  let theme = 'sky'

  try {
    const savedMode = localStorage.getItem('dealbook:appearance')
    const savedTheme = localStorage.getItem('dealbook:color-theme')
    if (savedMode === 'light' || savedMode === 'dark') mode = savedMode
    if (themes.includes(savedTheme)) theme = savedTheme
  } catch {
    // The defaults still allow the page to render when browser storage is blocked.
  }

  root.setAttribute('data-theme', theme)
  if (mode === 'system') root.removeAttribute('data-mode')
  else root.setAttribute('data-mode', mode)
})()
