import { Route, Router, Switch } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { HomeScreen } from '@/features/home';
import { LibraryScreen, ProjectPlaceholderScreen } from '@/features/library';
import { ModeScreen, NotFoundScreen } from '@/features/mode';
import { SettingsScreen } from '@/features/settings';
import { AppNav } from './AppNav';
import { useAppearance } from './appearance';
import { usePwaUpdate } from './pwa';

function Settings() {
  const { appearance, setAppearance } = useAppearance();
  const { needRefresh, update } = usePwaUpdate();
  return (
    <SettingsScreen
      appearance={appearance}
      onAppearanceChange={setAppearance}
      version={__APP_VERSION__}
      updateAvailable={needRefresh}
      onUpdate={update}
    />
  );
}

export function App() {
  return (
    <Router hook={useHashLocation}>
      <div className="pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
        <Switch>
          <Route path="/" component={HomeScreen} />
          <Route path="/mode/:id">{(params) => <ModeScreen id={params.id} />}</Route>
          <Route path="/library" component={LibraryScreen} />
          <Route path="/project/:id">
            {(params) => <ProjectPlaceholderScreen id={params.id} />}
          </Route>
          <Route path="/settings" component={Settings} />
          <Route component={NotFoundScreen} />
        </Switch>
      </div>
      <AppNav />
    </Router>
  );
}
