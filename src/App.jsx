import { useEffect } from 'react';
import { useRoute, go } from './hooks';
import { requestPersistence } from './db';
import { cls } from './utils';
import Home from './views/Home';
import Modules from './views/Modules';
import ModuleView from './views/ModuleView';
import Search from './views/Search';
import Settings from './views/Settings';
import Review from './views/Review';
import Archive from './views/Archive';

const NAV = [
  { to: '/', label: 'Home', icon: '⌂', match: (p) => p.length === 0 },
  { to: '/modules', label: 'Modules', icon: '▦', match: (p) => p[0] === 'modules' || p[0] === 'm' || p[0] === 'review' },
  { to: '/search', label: 'Search', icon: '⌕', match: (p) => p[0] === 'search' },
  { to: '/settings', label: 'Settings', icon: '⚙', match: (p) => p[0] === 'settings' || p[0] === 'archive' },
];

export default function App() {
  const { path, query } = useRoute();

  useEffect(() => {
    // Installed app → ask the browser to keep our data safe from eviction.
    if (window.matchMedia('(display-mode: standalone)').matches) requestPersistence();
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path.join('/')]);

  let view;
  switch (path[0]) {
    case undefined:
      view = <Home />;
      break;
    case 'modules':
      view = <Modules />;
      break;
    case 'm':
      view = <ModuleView key={path[1]} moduleKey={path[1]} path={path} query={query} />;
      break;
    case 'search':
      view = <Search />;
      break;
    case 'settings':
      view = <Settings />;
      break;
    case 'review':
      view = <Review />;
      break;
    case 'archive':
      view = <Archive />;
      break;
    default:
      view = <div className="empty">Page not found.</div>;
  }

  const isRoot = path.length === 0 || (path.length === 1 && ['modules', 'search', 'settings'].includes(path[0]));

  return (
    <div className="app">
      <header className="topbar">
        {!isRoot ? (
          <button className="icon-btn" aria-label="Back" onClick={() => (window.history.length > 1 ? window.history.back() : go('/'))}>
            ‹
          </button>
        ) : (
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="logo" />
        )}
        <button className="brand" onClick={() => go('/')}>
          Majaagya
        </button>
      </header>
      <main className="main">{view}</main>
      <nav className="bottomnav" aria-label="Main">
        {NAV.map((n) => (
          <button key={n.to} className={cls('nav-item', n.match(path) && 'on')} onClick={() => go(n.to)}>
            <span className="nav-icon" aria-hidden="true">
              {n.icon}
            </span>
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
