import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ShieldAlert, ScrollText, Settings, Terminal } from 'lucide-react';

const navItems = [
  { name: 'dashboard',      path: '/dashboard', icon: LayoutDashboard },
  { name: 'logs_explorer',  path: '/logs',      icon: ScrollText },
  { name: 'firewall',       path: '/firewall',  icon: ShieldAlert },
  { name: 'settings',       path: '/settings',  icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">

      {/* Logo */}
      <div className="sidebar-logo">
        <Terminal size={20} className="sidebar-logo-icon" />
        <span className="sidebar-logo-text">SENTINEL</span>
      </div>

      {/* System info strip */}
      <div className="sidebar-sys-info">
        <p className="sys-info-line"><span>sys</span>   apache_sentinel_v1</p>
        <p className="sys-info-line"><span>host</span>  localhost:3000</p>
        <p className="sys-info-line"><span>env</span>   development</p>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <p className="nav-section-label">Navigation</p>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-prompt">&gt;</span>
              <Icon size={15} />
              {item.name}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <p className="sidebar-footer-line">─────────────────────</p>
        <p className="sidebar-footer-line">apache_sentinel © 2026</p>
        <p className="sidebar-footer-line">ITE15 · university project</p>
      </div>
    </aside>
  );
}