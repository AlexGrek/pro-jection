import { useEffect, useRef, useState } from 'react'
import { IconLock } from '@tabler/icons-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface CodeInputProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCodeComplete: (code: string) => void
  title: string
}

export function CodeInput({ open, onOpenChange, onCodeComplete, title }: CodeInputProps) {
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (open) {
      setDigits(['', '', '', '', '', ''])
      setTimeout(() => inputRefs.current[0]?.focus(), 80)
    }
  }, [open])

  const handleChange = (index: number, value: string) => {
    const last = value.slice(-1)
    if (last && !/\d/.test(last)) return

    const next = [...digits]
    next[index] = last

    setDigits(next)

    if (last && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    if (next.every((d) => d !== '')) {
      onCodeComplete(next.join(''))
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const next = [...digits]
        next[index] = ''
        setDigits(next)
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose className="sm:max-w-sm">
        <DialogHeader className="items-center text-center">
          <IconLock size={28} stroke={1} className="text-muted-foreground mb-1" />
          <DialogTitle className="font-light text-xl">{title}</DialogTitle>
          <DialogDescription className="font-light">
            Enter the 6-digit numeric code to continue.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center gap-2 py-2">
          {digits.map((digit, i) => (
            <Input
              key={i}
              ref={(el) => { inputRefs.current[i] = el }}
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-11 h-14 text-center text-2xl font-light px-0 tracking-tight"
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
