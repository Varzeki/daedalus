import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function MediaIndex () {
  const router = useRouter()
  useEffect(() => { router.replace('/media/galnet') }, [])
  return null
}
