import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function MissionsIndex () {
  const router = useRouter()
  useEffect(() => { router.replace('/missions/overview') }, [])
  return null
}
