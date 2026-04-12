import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function ExplorationIndex () {
  const router = useRouter()
  useEffect(() => { router.replace('/exploration/route') }, [])
  return null
}
