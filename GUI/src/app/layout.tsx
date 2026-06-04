// Next.js metadata type, Google fonts loaders and global styles
import type { Metadata } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'

// Body font, exposed as a CSS variable for the rest of the app
const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

// Display font for headings, also exposed as a CSS variable
const display = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

// Page title and description used for the browser tab and SEO
export const metadata: Metadata = {
  title: 'CourtIQ — Live Basketball Analytics',
  description: 'Real-time shot tracking and analytics for professional basketball.',
}

// Root layout wrapping every page, wires the fonts and base colours onto the document
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} h-full`}>
      <body className="min-h-full bg-[var(--bg)] text-[var(--text)]">{children}</body>
    </html>
  )
}
