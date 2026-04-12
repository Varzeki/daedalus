import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function EngineeringIndex () {
  const router = useRouter()
  useEffect(() => { router.replace('/eng/blueprints') }, [])
  return null
}
