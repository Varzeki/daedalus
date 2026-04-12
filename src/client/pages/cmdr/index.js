import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function CmdrIndex () {
  const router = useRouter()
  useEffect(() => { router.replace('/cmdr/overview') }, [])
  return null
}
