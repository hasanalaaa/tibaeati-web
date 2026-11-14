import { useEffect, useState } from 'react';
import { liveQuery, storage } from '@/services/storage';
import type { ProjectListing } from '@/services/storage';

export type ProjectsState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; listing: ProjectListing };

/** Live list of projects: re-emits whenever the underlying tables change, in any tab. */
export function useProjects(): ProjectsState {
  const [state, setState] = useState<ProjectsState>({ status: 'loading' });
  useEffect(() => {
    const subscription = liveQuery(() => storage().projects.list()).subscribe({
      next: (listing) => {
        setState({ status: 'ready', listing });
      },
      error: () => {
        setState({ status: 'error' });
      },
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);
  return state;
}
