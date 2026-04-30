import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'CourtVision — Basketball Analytics',
  description: 'Shot chart analytics for professional basketball coaching and scouting',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" style={{ backgroundColor: '#0f172a' }}>
      <body className={`${inter.className} min-h-full`}>{children}</body>
    </html>
  )
}
