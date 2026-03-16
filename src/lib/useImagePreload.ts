import { useEffect } from 'react'

/**
 * Preload a list of image URLs so they are in the browser cache
 */
export function useImagePreload(urls: string[]) {
  useEffect(() => {
    const imgs: HTMLImageElement[] = []
    urls.forEach((u) => {
      if (!u) return
      const img = new Image()
      img.decoding = 'async'
      img.loading = 'eager'
      img.src = u
      imgs.push(img)
    })
    return () => {
      // allow GC
      imgs.splice(0, imgs.length)
    }
  }, [JSON.stringify(urls)])
}
