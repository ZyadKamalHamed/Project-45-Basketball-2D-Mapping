'use client'

// React context helpers and the filter-related types
import { createContext, useContext, useReducer, Dispatch, ReactNode } from 'react'
import { ShotFilters, ShotType, CourtMode } from '@/types/basketball'

// The set of actions that can update the active shot filters
type FilterAction =
  | { type: 'SET_TEAM'; payload: string | null }
  | { type: 'SET_PLAYER'; payload: number | null }
  | { type: 'SET_SHOT_TYPE'; payload: ShotType | null }
  | { type: 'SET_COURT_MODE'; payload: CourtMode }
  | { type: 'RESET' }

// The default filter state with nothing narrowed down and the half-court view selected
const initial: ShotFilters = {
  teamId: null,
  playerTrackId: null,
  shotType: null,
  courtMode: 'half',
}

// Reducer that applies each filter action to the current filter state
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

// Separate contexts for the filter state and its dispatch function
const FilterStateCtx = createContext<ShotFilters>(initial)
const FilterDispatchCtx = createContext<Dispatch<FilterAction>>(() => null)

// Provider that holds the filter state and exposes it to the component tree
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

// Hook to read the current filter state
export function useFilters() {
  return useContext(FilterStateCtx)
}

// Hook to dispatch filter actions
export function useFilterDispatch() {
  return useContext(FilterDispatchCtx)
}
