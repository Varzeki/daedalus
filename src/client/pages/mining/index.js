import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function MiningIndex () {
  const router = useRouter()
  useEffect(() => { router.replace('/mining/status') }, [])
  return null
}
