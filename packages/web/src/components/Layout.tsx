import { Outlet, Link } from 'react-router-dom';

export function Layout() {
  return (
    <div className="min-h-screen bg-bg-primary">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold text-white">
          🔧 PumpKit
        </Link>
        <nav className="flex gap-6 text-sm">
          <Link to="/" className="text-zinc-400 hover:text-white transition">Home</Link>
          <Link to="/dashboard" className="text-zinc-400 hover:text-white transition">Dashboard</Link>
          <a
            href="https://github.com/nirholas/pumpkit"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 hover:text-white transition"
          >
            GitHub
          </a>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
