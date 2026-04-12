import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function TradeIndex () {
  const router = useRouter()
  useEffect(() => { router.replace('/trade/routes') }, [])
  return null
}
