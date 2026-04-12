import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function ShipIndex () {
  const router = useRouter()
  useEffect(() => { router.replace('/ship/status') }, [])
  return null
}
