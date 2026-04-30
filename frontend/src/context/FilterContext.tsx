'use client'

import { createContext, useContext, useReducer, Dispatch, ReactNode } from 'react'
import { ShotFilters, ShotType, CourtMode } from '@/types/basketball'

type FilterAction =
  | { type: 'SET_TEAM'; payload: string | null }
  | { type: 'SET_PLAYER'; payload: number | null }
  | { type: 'SET_SHOT_TYPE'; payload: ShotType | null }
  | { type: 'SET_COURT_MODE'; payload: CourtMode }
  | { type: 'RESET' }

const initial: ShotFilters = {
  teamId: null,
  playerTrackId: null,
  shotType: null,
  courtMode: 'half',
}

function filterReducer(state: ShotFilters, action: FilterAction): ShotFilters {
  switch (action.type) {
    case 'SET_TEAM':
      return { ...state, teamId: action.payload, playerTrackId: null }
    case 'SET_PLAYER':
      return { ...state, playerTrackId: action.payload }
    case 'SET_SHOT_TYPE':
      return { ...state, shotType: action.payload }
    case 'SET_COURT_MODE':
      return { ...state, courtMode: action.payload }
    case 'RESET':
      return initial
    default:
      return state
  }
}

const FilterStateCtx = createContext<ShotFilters>(initial)
const FilterDispatchCtx = createContext<Dispatch<FilterAction>>(() => null)

export function FilterProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(filterReducer, initial)
  return (
    <FilterStateCtx.Provider value={state}>
      <FilterDispatchCtx.Provider value={dispatch}>
        {children}
      </FilterDispatchCtx.Provider>
    </FilterStateCtx.Provider>
  )
}

export function useFilters() {
  return useContext(FilterStateCtx)
}

export function useFilterDispatch() {
  return useContext(FilterDispatchCtx)
}
