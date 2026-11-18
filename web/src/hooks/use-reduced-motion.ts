// From tweenly (MIT licensed): https://trytweenly.vercel.app/docs/components/use-reduced-motion
// Pulled from its public registry on 2026-11-18. Local changes are marked with "Airbag:".
import { useSyncExternalStore } from "react"

const QUERY = "(prefers-reduced-motion: reduce)"

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

export function useReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  )
}
