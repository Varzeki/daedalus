import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function ControlsIndex () {
  const router = useRouter()
  useEffect(() => { router.replace('/controls/keybinds') }, [])
  return null
}
