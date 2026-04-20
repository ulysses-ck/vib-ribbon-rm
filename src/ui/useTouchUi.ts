import { useEffect, useState } from 'react'

/**
 * Show touch pads on narrow viewports with coarse pointer or no hover (typical phones/tablets).
 */
export function useTouchUi(): boolean {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const mqNarrow = globalThis.matchMedia('(max-width: 1024px)')
    const mqCoarse = globalThis.matchMedia('(pointer: coarse)')
    const mqNoHover = globalThis.matchMedia('(hover: none)')

    const sync = () => {
      const narrow = mqNarrow.matches
      const touchLike = mqCoarse.matches || mqNoHover.matches
      setShow(narrow && touchLike)
    }

    sync()
    mqNarrow.addEventListener('change', sync)
    mqCoarse.addEventListener('change', sync)
    mqNoHover.addEventListener('change', sync)
    return () => {
      mqNarrow.removeEventListener('change', sync)
      mqCoarse.removeEventListener('change', sync)
      mqNoHover.removeEventListener('change', sync)
    }
  }, [])

  return show
}
