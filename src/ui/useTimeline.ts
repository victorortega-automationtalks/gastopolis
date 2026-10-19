import { useMemo, useState } from 'react'
import { buildFrames, dataSpan, frameIndexOf, type Frame, type TimeStep } from '../model/timeline'
import type { Movement } from '../model/types'
import type { Speed } from './TimePlayer'

export interface Timeline {
  frames: Frame[]
  index: number
  frame: Frame | null
  step: TimeStep
  speed: Speed
  playing: boolean
  setIndex: (i: number) => void
  setStep: (s: TimeStep) => void
  setSpeed: (s: Speed) => void
  setPlaying: (p: boolean) => void
}

/**
 * Estado del reproductor temporal de una escena. `initial` decide en qué fotograma empieza (por defecto, el
 * último); al cambiar de paso se queda en la misma fecha.
 */
export function useTimeline(movements: Movement[], defaultStep: TimeStep, initial?: (frames: Frame[]) => number): Timeline {
  const [step, setStepRaw] = useState<TimeStep>(defaultStep)
  const [picked, setIndex] = useState<number | null>(null)
  const [speed, setSpeed] = useState<Speed>(1)
  const [playing, setPlaying] = useState(false)
  const span = useMemo(() => dataSpan(movements), [movements])
  const frames = useMemo(() => (span ? buildFrames(span.first, span.last, step) : []), [span, step])
  const fallback = frames.length ? (initial ? initial(frames) : frames.length - 1) : 0
  const index = Math.min(picked ?? fallback, Math.max(0, frames.length - 1))
  const frame = frames[index] ?? null

  const setStep = (s: TimeStep) => {
    if (s === step) return
    if (frame && span) setIndex(frameIndexOf(buildFrames(span.first, span.last, s), frame.to))
    setStepRaw(s)
  }

  return { frames, index, frame, step, speed, playing, setIndex, setStep, setSpeed, setPlaying }
}
