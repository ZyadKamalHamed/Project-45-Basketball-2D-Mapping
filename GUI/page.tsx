'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Activity, Upload } from 'lucide-react'
import { FilterProvider } from '@/context/FilterContext'
import { CourtMap } from '@/components/dashboard/CourtMap'
import { FilterControls } from '@/components/dashboard/FilterControls'
import { StatsCardsRow } from '@/components/dashboard/StatsCardsRow'
import { PlayerStatsTable } from '@/components/dashboard/PlayerStatsTable'
import { MOCK_ANALYSIS } from '@/lib/mock-data'
import { computeTeamStats, computePlayerStats } from '@/lib/stats-utils'

export default function DashboardPage() {
  const { shots, playerTracks, teams, gameLabel } = MOCK_ANALYSIS

  const teamStats = useMemo(() => computeTeamStats(shots, teams), [shots, teams])
  const playerStats = useMemo(() => computePlayerStats(shots, playerTracks, teams), [shots, playerTracks, teams])

  return (
    <FilterProvider>
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0f172a' }}>
        {/* Header */}
        <header className="border-b border-slate-800 px-6 py-3 sticky top-0 z-10" style={{ backgroundColor: '#0f172a' }}>
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
                <Activity size={14} className="text-white" />
              </div>
              <span className="font-semibold text-slate-100 text-sm tracking-tight">CourtVision</span>
              <span className="text-slate-700 text-sm">·</span>
              <span className="text-slate-400 text-sm">{gameLabel}</span>
            </div>
            <Link
              href="/"
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors rounded-md px-3 py-1.5 border border-slate-700 hover:border-slate-600"
            >
              <Upload size={13} />
              New Game
            </Link>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-6 space-y-6">
          {/* Team stats */}
          <section>
            <SectionLabel>Team Statistics</SectionLabel>
            <StatsCardsRow teamStats={teamStats} />
          </section>

          {/* Court map */}
          <section>
            <SectionLabel>Shot Chart</SectionLabel>
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-5">
              <div className="mb-4">
                <FilterControls teams={teams} playerTracks={playerTracks} />
              </div>
              <CourtMap shots={shots} playerTracks={playerTracks} teams={teams} />
            </div>
          </section>

          {/* Player table */}
          <section>
            <PlayerStatsTable playerStats={playerStats} />
          </section>
        </main>

        <footer className="border-t border-slate-800 px-6 py-3 text-center">
          <p className="text-xs text-slate-600">
            CourtVision — Built for coaching and scouting professionals
          </p>
        </footer>
      </div>
    </FilterProvider>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-medium uppercase tracking-widest text-slate-500 mb-3">
      {children}
    </h2>
  )
}
